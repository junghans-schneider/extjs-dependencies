extjs-dependencies
==================

Resolves and sorts all dependencies of an Ext JS project so you can build without the sencha tool.

**Features:**

  - Build your Ext JS project without having to use the sencha tools.
  - No dependency to any particular build system. So it's a ideal base to add Ext JS dependency
detection to any build system.
  - Only includes the source files you really need.
  - Sorts your source files in the right order.


Basic usage
-----------

Install `extjs-dependencies` in your project:

    npm install --save-dev extjs-dependencies

Then add it to your build:

~~~javascript
var ExtjsDependencies = require('extjs-dependencies');

var extJsFiles = ExtjsDependencies.resolveFiles({
    entry: [ 'ext/ext-dev.js', 'app.js' ],  // Add all entry points to include with dependencies
    resolve: {
        path: {
            'Ext':   'ext/src',             // Source folder of classes starting with `Ext.`
            'myapp': 'app'                  // Source folder of classes starting with `myapp.`
        }
    }
});

// extJsFiles = [
//   'ext/ext-dev.js',
//   'ext/src/button/Button.js',
//   ...
//   'app/view/Main.js',
//   'app.js'
// ]
~~~


Using a separate Ext JS script
------------------------------

If you prefer to load the Ext JS core using an extra script tag, you can exclude it from your build:

~~~javascript
var ExtjsDependencies = require('extjs-dependencies');

var extJsFiles = ExtjsDependencies.resolveFiles({
    provided: 'ext/ext-all-dev.js',       // Add Ext JS scripts you load independently in your html file
    entry: 'app.js',                      // Add all entry points to include with dependencies
    resolve: {
        path: {
            'Ext':   'ext/src',           // Source folder of classes starting with `Ext.`
            'myapp': 'app'                // Source folder of classes starting with `myapp.`
        }
    }
});
~~~


All options
-----------

~~~javascript
var ExtjsDependencies = require('extjs-dependencies');

var extJsFiles = ExtjsDependencies.resolveFiles({
    encoding: 'utf8',                     // Source file encoding. Default: 'utf8'
    root: 'path/to/project',              // The root of your project. All paths are relative to this. Default: '.'
    provided: [ 'extjs/ext-dev.js' ],     // Add Ext JS scripts you load independently in your html file
    entry: [ 'app.js' ],                  // Add all entry points to include with dependencies
    resolve: {
        path: {                           // The source folders for each class name prefix
            'Ext':   'ext/src',
            'myapp': 'app'
        },
        alias: {                          // Optional. Alternative class names
            'Ext.Layer': 'Ext.dom.Layer'
        }
    },
    extraDependencies: {                  // Optional
        requires: {
            'MyClass': 'MyDependency'     // Define extra require-dependencies here
        },
        uses: {
            'MyClass': 'MyDependency'     // Define extra uses-dependencies here
        }
    }
    excludeClasses: ['Ext.*', 'MyApp.some.Class'],  // Optional. Classes to exclude
    skipParse: ['app/ux/SkipMe.js']                 // Optional. Files to exclude (excludes also dependencies)
});
~~~


API
---

### resolveFiles(options)

Resolves and sorts all dependencies of an Ext JS project.

**Parameter:** See "All options".  
**Returns:** A sorted array of paths to the source files.


### resolve(options)

Does the same as `resolveFiles`, but returns an array of `ExtFile` objects holding the parser result for each source file.

**Tip:** You can use the `src` attribute of the `ExtFile` object to create a better optimized build. However this will break source maps.

**Parameter:** See "All options".  
**Returns:** A sorted array of `ExtFile` objects with the parser result for each source file.

Attributes of `ExtFile` objects:

~~~javascript
extFile.names;        // The class names defined in the source file
extFile.parentName;   // The name of the parent class. May be `null`
extFile.aliasNames;   // Alias names of other classes (not necessarily defined in this source file)
extFile.requires;     // Strong dependencies (which must be loaded before this source file)
extFile.uses;         // Weak dependencies (which can be loaded after this source file)
extFile.src;          // The optimized source code (with some statements like `require: [ ... ]` removed)
extFile.path;         // The path to the source file (relative to `options.root`)
~~~


### parse(src, filePath, options)

Parses a single source file.

**Parameters:**

  - `src` the source code as string. If you don't have the source loaded, used `parseFile` instead (see below).
  - `filePath` the path to the source file. Should be relative to `options.root`.
  - `options` See "All options", only the following attributes are used: `excludeClasses`, `skipParse` and `extraDependencies`.
  
**Returns:** A `ExtFile` object. See "resolve".



### parseFile(filePath, options)

Loads and parses a single source file.

**Parameters:**

  - `filePath` the path to the source file. Should be relative to `options.root`.
  - `options` See "All options", only the following attributes are used: `excludeClasses`, `skipParse` and `extraDependencies`.
  
**Returns:** A `ExtFile` object. See "resolve".



### createDummyExtFile(filePath)

Creates a dummy `ExtFile` object without any dependencies. Can be used to include other scripts.

**Parameter:** the path to the source file. Should be relative to `options.root`.  
**Returns:** A dummy `ExtFile` object.

Attributes of the dummy `ExtFile` object:

~~~javascript
extFile.names;        // An array holding the `filePath`
extFile.path;         // The `filePath`
~~~



History
-------

This project is based on the parser used in `grunt-extjs-dependencies` written by Rowan Crawford and Christofer Pak.
You can find the original code [in the grunt-extjs-dependencies project](https://github.com/cpak/grunt-extjs-dependencies/blob/master/tasks/lib/parser.js).

The original parser has strong dependencies to grunt and others. Since I needed to determine Ext JS dependencies in a
non-grunt environment, I decided to extract the parser and to remove those dependencies.