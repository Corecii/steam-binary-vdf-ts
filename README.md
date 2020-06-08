`npm i --save steam-binary-vdf`

# Steam Binary VDF

`steam-binary-vdf` is a module for reading and writing the binary vdf file format used in files like `shortcuts.vdf`. This module also provides a utility function for calculating the `steam://rungameid/` url for a shortcut.

## Exports

```ts
readVdf(buffer: Buffer, offset?: number): Object
```
Reads a vdf file from a buffer and returns an object with its contents.
This returns a "plain" object of `[key: string]: value` with the values from the vdf file.

```ts
writeVdf(map: Object): Buffer
```
Writes an object to a new buffer then returns the buffer.

VDF files values only accept:
* **unsigned 32-bit numbers**: `writeVdf` will error if a number is outside of the range `0 <= value <= 4294967295`.
* **strings without null chars `\0`**: `writeVdf` will error if a string contains null chars. Remove, replace, or truncate your strings first. VDF files use null-terminated strings internally.
* **Objects with string keys and accepted values**: `writeVdf` will error if a value does not match an accepted type.

```ts
getShortcutHash(input: string): string
```
Returns the "hash" used by steam to represent non-steam shortcuts
in the `steam://rungameid/` format. This uses code adapted from [Scott Rice's ICE program](https://github.com/scottrice/Ice).

```ts
getShortcutUrl(appName: string, exe: string): string
```
Returns the shortcut url for a shortcut with the given name and target. The name is the `AppName` field and the target is the `exe` field from the shortcut entry in the shortcuts file.

This just returns `"steam://rungameid/" + getShortcutHash(exe + appName)`

## Shortcuts.vdf example

```ts
import { readVdf, writeVdf } from "steam-binary-vdf";
import fs from "fs-extra";

// read the vdf
const inBuffer = await fs.readFile("C:\\Program Files (x86)\\Steam\\userdata\\USER_ID\\config\\shortcuts.vdf")

const shortcuts = readVdf(inBuffer);
console.log(shortcuts); // output below;

// add to the vdf
shortcuts.shortcuts['2'] = {
  AppName: 'Game 3',
  exe: 'D:\\Games\\Game.exe'
};

const outBuffer = writeVdf(shortcuts);

await fs.writeFile("C:\\Program Files (x86)\\Steam\\userdata\\USER_ID\\config\\shortcuts.vdf", outBuffer);
```

This will produce something like...

```js
{
  shortcuts: {
    '0': {
      AppName: 'Game 1',
      exe: '"C:\\Program Files\\Game 1\\Game.exe"',
      StartDir: '"C:\\Program Files\\Game 1"',
      icon: '',
      ShortcutPath: '',
      LaunchOptions: '',
      IsHidden: 0,
      AllowDesktopConfig: 1,
      AllowOverlay: 1,
      openvr: 0,
      Devkit: 0,
      DevkitGameID: '',
      LastPlayTime: 1527542942,
      tags: {'0': 'some tag', '1': 'another tag'}
    },
    '1': {
      AppName: 'Another Game',
      exe: '"C:\\Program Files\\Some Game 2\\AnyExe.exe"',
      StartDir: '"C:\\Any Location"',
      icon: '',
      ShortcutPath: '',
      LaunchOptions: '',
      IsHidden: 0,
      AllowDesktopConfig: 1,
      AllowOverlay: 1,
      openvr: 0,
      Devkit: 0,
      DevkitGameID: '',
      LastPlayTime: 1525830068,
      tags: {}
    }
  }
}
```

Notable things about `shortcuts.vdf`:

* The root of VDF files are maps of string keys to values. `shortcuts.vdf` puts all of the shortcuts in the `shortcuts` value under the root. The vdf file *can* include more values under the root but typically does not. You can set and save other values under the root and Steam will treat the file like normal after a restart, but won't necessarily keep the extra data.
* `shortcuts` is a *map* with numbers as *string keys*. Using a proper key here doesn't actually matter: steam will fix all keys to a number-as-a-string on startup.
* `tags` is map-as-a-list like `shortcuts`, but I couldn't get steam to use it so I couldn't test its behavior.
* When steam starts, it reads and sanitizes `shortcuts.vdf`. This means:
  * Any non-object values under `shortcuts` get discarded
  * Any object values under `shortcuts` get converted into shortcut definitions. Unknown keys in the object are removed and any non-existent shortcut definition keys are added with their default values.
  * Keys under `shortcuts` get converted to numbers-as-strings. For example, setting `shortcuts.a = {AppName: 'Test'}` in the above example would become `shortcuts['2']` or `['3']` depending on the contents.
* `LastPlayTime` is a timestamp
* Booleans are represented as numbers where 0 is false and 1 is true.
* If `shortcuts.vdf` does not follow the binary vdf format, it is cleared and reset to an empty shortcuts vdf.

The default values for a shortcut definition are:
```js
{
  AppName: '',
  exe: '',
  StartDir: '',
  icon: '',
  ShortcutPath: '',
  LaunchOptions: '',
  IsHidden: 0,
  AllowDesktopConfig: 1,
  AllowOverlay: 1,
  openvr: 0,
  Devkit: 0,
  DevkitGameID: '',
  LastPlayTime: 0,
  tags: {}
}
```

# Binary VDF Format

The binary vdf format is built around a few structures:
* Null-terminated strings (here on called `String`)
* 32-bit little-endian integers (here on called `Integer`)
* Map (here on called `Map`)
* 1-byte object type (here on called `MapItemType`)
  * `0x00` represents a Map
  * `0x01` represents a String
  * `0x02` represents a Number
  * `0x08` represents the end of a map

`Map` is structured as reptitions of any of the following:
* `MapItemType(0x01)` `String(name)` `String(value)`
* `MapItemType(0x02)` `String(name)` `Integer(value)`
* `MapItemType(0x00)` `String(name)` `Map(value)`
* `MapItemType(0x08)`

When a type of `0x08` is encountered, map reading stops.

The root of a binary vdf file is a `Map`.

`steam-binary-vdf` reads `Integers` as unsigned integers. I haven't seen enough user-editable integers in vdf files to test if this is a correct representation of the data.

`steam-binary-vdf` reads `Strings` as utf-8. The vdf format likely accepts any sequence of bytes for a string as long as it doesn't contain a null character `\0`.