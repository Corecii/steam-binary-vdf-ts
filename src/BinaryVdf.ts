import BufferReader from "buffer-reader";
import * as polycrc from "polycrc";
import Int64 from "node-int64";
import { hexToDec } from "hex2dec";

export type VdfMap = {
	[name: string]: VdfMap | string | number;
};

const enum VdfMapItemType {
	Map = 0x00,
	String = 0x01,
	Number = 0x02,
	MapEnd = 0x08,
}

type VdfMapItem =
	| {
			type: VdfMapItemType.MapEnd;
	  }
	| {
			type: VdfMapItemType.String;
			name: string;
			value: string;
	  }
	| {
			type: VdfMapItemType.Number;
			name: string;
			value: number;
	  }
	| {
			type: VdfMapItemType.Map;
			name: string;
			value: VdfMap;
	  };

function nextMapItem(buffer: BufferReader): VdfMapItem {
	const typeByte = buffer.nextUInt8();
	if (typeByte === VdfMapItemType.MapEnd) {
		return {
			type: typeByte,
		};
	}

	const name = buffer.nextStringZero();
	let value;
	switch (typeByte) {
		case VdfMapItemType.Map: {
			value = nextMap(buffer);
			break;
		}
		case VdfMapItemType.String: {
			value = buffer.nextStringZero("utf-8");
			break;
		}
		case VdfMapItemType.Number: {
			value = buffer.nextUInt32LE();
			break;
		}
	}

	return {
		type: typeByte,
		name: name,
		value: value,
	};
}

function nextMap(buffer: BufferReader): VdfMap {
	const contents = {};
	while (true) {
		const mapItem = nextMapItem(buffer);
		if (mapItem.type === VdfMapItemType.MapEnd) {
			break;
		}
		contents[mapItem.name] = mapItem.value;
	}
	return contents;
}

export function readVdf(buffer: Buffer, offset?: number): VdfMap {
	const reader = new BufferReader(buffer);
	if (offset) {
		reader.seek(offset);
	}
	return nextMap(reader);
}

function addByte(value: number, contents: Array<Buffer>) {
	const typeBuffer = Buffer.allocUnsafe(1);
	typeBuffer.writeUInt8(value);
	contents.push(typeBuffer);
}

function addNumber(value: number, contents: Array<Buffer>) {
	const valueBuffer = Buffer.allocUnsafe(4);
	valueBuffer.writeUInt32LE(value);
	contents.push(valueBuffer);
}

function addString(value: string, contents: Array<Buffer>) {
	if (value.indexOf("\0") !== -1) {
		throw new Error('Strings in VDF files cannot have null chars ("\\0")');
	}
	contents.push(Buffer.from(value, "utf-8"));
	addByte(0, contents);
}

function addMap(map: VdfMap, contents: Array<Buffer>) {
	for (const key of Object.keys(map)) {
		const value = map[key];
		if (typeof value === "number") {
			addByte(VdfMapItemType.Number, contents);
			addString(key, contents);
			addNumber(value, contents);
		} else if (typeof value === "string") {
			addByte(VdfMapItemType.String, contents);
			addString(key, contents);
			addString(value, contents);
		} else if (typeof value === "object") {
			addByte(VdfMapItemType.Map, contents);
			addString(key, contents);
			addMap(value, contents);
		} else {
			throw new Error(
				`Type at ${key} (${typeof value}) is not allowed in VDF files. VDF files can only contain numbers, strings, or objects`,
			);
		}
	}
	const endBuffer = Buffer.allocUnsafe(1);
	endBuffer.writeUInt8(VdfMapItemType.MapEnd);
	contents.push(endBuffer);
}

export function writeVdf(map: VdfMap): Buffer {
	const contents: Array<Buffer> = [];
	addMap(map, contents);
	return Buffer.concat(contents);
}

let shortcutCrc: ((buffer: Buffer | string | number) => number) | undefined;
export function getShortcutHash(input: string): string {
	shortcutCrc = shortcutCrc || polycrc.crc(32, 0x04c11db7, 0xffffffff, 0xffffffff, true);
	const full64 = new Int64(shortcutCrc(input) | 0x80000000, 0x02000000);
	return hexToDec(full64.toOctetString());
}

export function getShortcutUrl(appName: string, exe: string): string {
	return "steam://rungameid/" + getShortcutHash(exe + appName);
}

/*
getShortcutHash uses code adapted from [Scott Rice's ICE
program](https://github.com/scottrice/Ice) which is under the following license:

Copyright (c) 2012, 2013 Scott Rice
All rights reserved.

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.
*/
