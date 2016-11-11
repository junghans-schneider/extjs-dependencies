extjs-dependencies [![NPM version][npm-image]][npm-url]
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
var extdeps = require('extjs-dependencies');

var extFiles = extdeps.resolveFiles({
    entry: [ 'ext/ext-dev.js', 'app.js' ]  // Add all entry points to include with dependencies
});

// extFiles = [
//   'ext/ext-dev.js',
//   'ext/src/button/Button.js',
//   ...
//   'app/view/Main.js',
//   'app.js'
// ]
~~~


Gulp example
------------

The following example shows how to use `extjs-dependencies` with [gulp](http://gulpjs.com/).
Please note that `extjs-dependencies` doesn't depend on gulp. So you can use it with other build systems, too.

Example `gulpfile.js`:

~~~javascript
var gulp       = require('gulp');
var concat     = require('gulp-concat');
var sourcemaps = require('gulp-sourcemaps');     // Optional
var extdeps    = require('extjs-dependencies');

gulp.task('scripts', function(){
    var extFiles = extdeps.resolveFiles({
        entry: [ 'ext/ext-dev.js', 'app.js' ]
    });

    return gulp.src(extFiles)
        .pipe(sourcemaps.init())       // Optional
        .pipe(concat('scripts.js'))
        .pipe(sourcemaps.write('.'))   // Optional
        .pipe(gulp.dest('build'));
});
~~~


Using a separate Ext JS script
------------------------------

If you prefer to load the Ext JS core using an extra script tag, you can exclude it from your build:

~~~javascript
var extdeps = require('extjs-dependencies');

var extFiles = extdeps.resolveFiles({
    provided: 'ext/ext-all-dev.js',       // Add Ext scripts you load independently in your html file
    entry: 'app.js'                       // Add all entry points to include with dependencies
});
~~~


All options
-----------

~~~javascript
var extdeps = require('extjs-dependencies');

var extFiles = extdeps.resolveFiles({
    // Log verbose? Optional, default is false.
    verbose: false,

    // Source file encoding. Optional, default is 'utf8'
    encoding: 'utf8',

    // The root of your project. All paths are relative to this. Optional, default is '.'
    root: 'path/to/project',

    // Add Ext JS scripts you load independently in your html file. Optional.
    provided: [ 'extjs/ext-dev.js' ],

    // Add all entry points to include with dependencies
    entry: [ 'app.js' ],

    resolve: {
        // The source folders for each class name prefix
        path: {
            'Ext':   'ext/src',   // Search classes starting with `Ext.` in `ext/src`
            'myapp': 'app'        // Search classes starting with `myapp.` in `app`
        },

        // Alternative class names. Optional.
        alias: {
            'Ext.Layer': 'Ext.dom.Layer'
        }
    },

    // Optimize source? (removes some statements like `require`) Optional, default is false.
    optimizeSource: false,

    // Extra dependencies. Optional.
    extraDependencies: {
        requires: {
            'MyClass': 'MyDependency'
        },
        uses: {
            'MyClass': 'MyDependency'
        }
    }

    // Classes to exclude. Optional.
    excludeClasses: ['Ext.*', 'MyApp.some.Class'],

    // Files to exclude (excludes also dependencies). Optional.
    skipParse: ['app/ux/SkipMe.js']
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

**Tip:** If you set `optimizeSource` to `true`, you can use the `src` attribute of the `ExtFile` object to create a better optimized build. However this will break source maps.

**Parameter:** See "All options".  
**Returns:** A sorted array of `ExtFile` objects with the parser result for each source file.

Attributes of `ExtFile` objects:

~~~javascript
extFile.names;        // The class names defined in the source file
extFile.parentName;   // The name of the parent class. May be `null`
extFile.aliasNames;   // Alias names of other classes (not necessarily defined in this source file)
extFile.requires;     // Strong dependencies (which must be loaded before this source file)
extFile.uses;         // Weak dependencies (which can be loaded after this source file)
extFile.src;          // The source code (is optimized if `optimizeSource` is `true`)
extFile.path;         // The path to the source file (relative to `options.root`)
~~~


### parse(src, filePath, options)

Parses a single source file.

**Parameters:**

  - `src` the source code as string. If you don't have the source loaded, used `parseFile` instead (see below).
  - `filePath` the path to the source file. Should be relative to `options.root`.
  - `options` See "All options", only the following attributes are used: `optimizeSource`, `excludeClasses`, `skipParse` and `extraDependencies`.
  
**Returns:** A `ExtFile` object. See "resolve".



### parseFile(filePath, options)

Loads and parses a single source file.

**Parameters:**

  - `filePath` the path to the source file. Should be relative to `options.root`.
  - `options` See "All options".
  
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


[npm-url]: https://www.npmjs.com/package/extjs-dependencies
[npm-image]: https://img.shields.io/npm/v/extjs-dependencies.svg
