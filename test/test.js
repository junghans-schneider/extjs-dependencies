'use strict';

var assert = require('assert');
var Parser = require('../lib/parser');


function noop() {}

var testLogger = {
    lastWarn: null,

    write:     noop,
    writeln:   noop,
    ok:        noop,
    warn: function(message) {
        this.lastWarn = message;
    },
    resetWarn: function() {
        this.lastWarn = null;
    }
};

// Assert documentation: https://nodejs.org/api/assert.html

describe('Parser', function() {
    describe('#parse(src,filePath)', function() {

        it('should detect normal Ext.define calls with requires and uses', function() {
            var src, extFile;

            src = "Ext.define('MyClass', { extend: 'A', requires: 'B', uses: 'C' })";
            extFile = (new Parser()).parse(src, 'test');
            assert.deepEqual([ 'MyClass' ], extFile.names);
            assert.equal('A', extFile.parentName);
            assert.deepEqual([ 'A', 'B' ], extFile.requires);
            assert.deepEqual([ 'C' ], extFile.uses);

            src = "Ext.define('MyClass', { extend: 'A', requires: [ 'C', 'B' ], uses: [ 'D', 'E', 'D' ] })";
            extFile = (new Parser()).parse(src, 'test');
            assert.deepEqual([ 'MyClass' ], extFile.names);
            assert.equal('A', extFile.parentName);
            assert.deepEqual([ 'A', 'B', 'C' ], extFile.requires);
            assert.deepEqual([ 'D', 'E' ], extFile.uses);
        });

        it('should detect Ext.define calls using a wrapper function', function() {
            // See: Ext.tip.QuickTipManager or Ext.dom.Element

            var src, extFile;

            src = "Ext.define('MyClass', (function() { var private = 42; return { extend: 'A', requires: 'B', uses: 'C' } })() )";
            extFile = (new Parser()).parse(src, 'test');
            assert.deepEqual([ 'MyClass' ], extFile.names);
            assert.equal('A', extFile.parentName);
            assert.deepEqual([ 'A', 'B' ], extFile.requires);
            assert.deepEqual([ 'C' ], extFile.uses);

            src = "Ext.define('MyClass', (function() { var private = 42; return { extend: 'A', requires: [ 'C', 'B' ], uses: [ 'D', 'E', 'D' ] } })() )";
            extFile = (new Parser()).parse(src, 'test');
            assert.deepEqual([ 'MyClass' ], extFile.names);
            assert.equal('A', extFile.parentName);
            assert.deepEqual([ 'A', 'B', 'C' ], extFile.requires);
            assert.deepEqual([ 'D', 'E' ], extFile.uses);
        });

        it('should handle odd calls to Ext.define correctly', function() {
            var src, extFile;

            testLogger.resetWarn();
            src = "Ext.define('some' + 'fancy' + 'stuff', {})";
            extFile = (new Parser({ logger: testLogger })).parse(src, 'test');
            assertLastWarnIncludes('Cannot determine class name in define call');

            // But don't warn for the `Ext.define` call used in the implementation of `Ext.application`
            testLogger.resetWarn();
            src = 'Ext.define(config.name + ".$application", {})';
            extFile = (new Parser({ logger: testLogger })).parse(src, 'test');
            assertNoWarn();
        });

        it('should detect mixins', function() {
            var src, extFile;

            src = "Ext.define('A', { mixins: { b: 'B' } })";
            extFile = (new Parser()).parse(src, 'test');
            assert.deepEqual([ 'A' ], extFile.names);
            assert.deepEqual([ 'B' ], extFile.requires);

            src = "Ext.define('A', { mixins: { c: 'C', b: 'B' } })";
            extFile = (new Parser()).parse(src, 'test');
            assert.deepEqual([ 'A' ], extFile.names);
            assert.deepEqual([ 'B', 'C' ], extFile.requires);
        });

        it('should detect controllers', function() {
            var src, extFile;

            src = "Ext.define('myapp.mypackage.MyClass', { controllers: [ 'A', 'B' ] })";
            extFile = (new Parser()).parse(src, 'test');
            assert.deepEqual([ 'myapp.mypackage.MyClass' ], extFile.names);
            assert.deepEqual([ 'myapp.controller.A', 'myapp.controller.B' ], extFile.uses);
        });

        it('should detect models', function() {
            var src, extFile;

            src = "Ext.define('myapp.controller.Foo', { extend: 'Ext.app.Controller', models: [ 'A', 'B' ] })";
            extFile = (new Parser()).parse(src, 'test');
            assert.deepEqual([ 'myapp.controller.Foo' ], extFile.names);
            assert.deepEqual([ 'myapp.model.A', 'myapp.model.B' ], extFile.uses);
        });

        it('should detect stores', function() {
            var src, extFile;

            src = "Ext.define('myapp.controller.Foo', { extend: 'Ext.app.Controller', stores: [ 'A', 'B' ] })";
            extFile = (new Parser()).parse(src, 'test');
            assert.deepEqual([ 'myapp.controller.Foo' ], extFile.names);
            assert.deepEqual([ 'myapp.store.A', 'myapp.store.B' ], extFile.uses);
        });

        it('should detect views', function() {
            var src, extFile;

            src = "Ext.define('myapp.controller.Foo', { extend: 'Ext.app.Controller', views: [ 'A', 'B' ] })";
            extFile = (new Parser()).parse(src, 'test');
            assert.deepEqual([ 'myapp.controller.Foo' ], extFile.names);
            assert.deepEqual([ 'myapp.view.A', 'myapp.view.B' ], extFile.uses);
        });

        it('should detect belongsTo', function() {
            var src, extFile;

            src = "Ext.define('MyModel', { extend: 'Ext.data.Model', belongsTo: 'A' })";
            extFile = (new Parser()).parse(src, 'test');
            assert.deepEqual([ 'MyModel' ], extFile.names);
            assert.deepEqual([ 'Ext.data.Model', 'Ext.data.association.BelongsTo' ], extFile.requires);
            assert.deepEqual([ 'A' ], extFile.uses);

            src = "Ext.define('MyModel', { extend: 'Ext.data.Model', belongsTo: [ 'A', 'B' ] })";
            extFile = (new Parser()).parse(src, 'test');
            assert.deepEqual([ 'MyModel' ], extFile.names);
            assert.deepEqual([ 'Ext.data.Model', 'Ext.data.association.BelongsTo' ], extFile.requires);
            assert.deepEqual([ 'A', 'B' ], extFile.uses);
        });

        it('should detect hasMany', function() {
            var src, extFile;

            src = "Ext.define('MyModel', { extend: 'Ext.data.Model', hasMany: { model: 'Product', name: 'products' } })";
            extFile = (new Parser()).parse(src, 'test');
            assert.deepEqual([ 'MyModel' ], extFile.names);
            assert.deepEqual([ 'Ext.data.Model', 'Ext.data.association.HasMany' ], extFile.requires);
            assert.deepEqual([ 'Product' ], extFile.uses);

            src = "Ext.define('MyModel', { extend: 'Ext.data.Model', " +
                "hasMany: [ { model: 'Product', name: 'products' }, { model: 'User', name: 'users' } ] })";
            extFile = (new Parser()).parse(src, 'test');
            assert.deepEqual([ 'MyModel' ], extFile.names);
            assert.deepEqual([ 'Ext.data.Model', 'Ext.data.association.HasMany' ], extFile.requires);
            assert.deepEqual([ 'Product', 'User' ], extFile.uses);

            // Don't fail if hasMany contains something the parser doesn't understand
            testLogger.resetWarn();
            src = "Ext.define('MyModel', { extend: 'Ext.data.Model', hasMany: 'unsupported-stuff' })";
            extFile = (new Parser({ logger: testLogger })).parse(src, 'test');
            assert.deepEqual([ 'MyModel' ], extFile.names);
            assert.deepEqual([ 'Ext.data.Model', 'Ext.data.association.HasMany' ], extFile.requires);
            assert.deepEqual([], extFile.uses);
            assertLastWarnIncludes('Expected object or array with property');
        });

        it('should detect Ext.application calls', function() {
            var src, extFile;

            src = "Ext.application({ name: 'myapp', requires: [ 'A', 'B' ], uses: [ 'C', 'D' ] })";
            extFile = (new Parser()).parse(src, 'test');
            assert.deepEqual(['myapp'], extFile.names);
            assert.equal(null, extFile.parentName);
            assert.deepEqual([ 'A', 'B', 'Ext.app.Application' ], extFile.requires);
            assert.deepEqual([ 'C', 'D' ], extFile.uses);
            assert.deepEqual({ myapp: 'app' }, extFile.resolvePaths);

            src = "Ext.application({ name: 'myapp', appFolder: 'src/myapp' })";
            extFile = (new Parser()).parse(src, 'test');
            assert.deepEqual(['myapp'], extFile.names);
            assert.deepEqual({ myapp: 'src/myapp' }, extFile.resolvePaths);
        });

        it('should detect Ext core path', function() {
            var src, extFile;

            src = "var Ext = Ext || {};";
            extFile = (new Parser()).parse(src, 'path/to/ext/ext-dev.js');
            assert.deepEqual({ Ext: 'path/to/ext/src' }, extFile.resolvePaths);
        });

        it('should detect Ext.Loader.setPath calls', function() {
            var src, extFile;

            src = "Ext.Loader.setPath('Ext.ux', 'lib/extjs-ux/src'); var bla = 5; Ext.Loader.setPath('Extensible', 'lib/extensible/src');";
            extFile = (new Parser()).parse(src, 'test');
            assert.deepEqual({ 'Ext.ux': 'lib/extjs-ux/src', 'Extensible': 'lib/extensible/src' }, extFile.resolvePaths);
        });

        it('should detect Ext.require calls', function() {
            var src, extFile;

            src = "Ext.require('A', function() {})";
            extFile = (new Parser()).parse(src, 'test');
            assert.deepEqual([ 'A' ], extFile.requires);

            src = "Ext.require([ 'A', 'B' ], function() {})";
            extFile = (new Parser()).parse(src, 'test');
            assert.deepEqual([ 'A', 'B' ], extFile.requires);

            // Don't fail for dynamic Ext.require calls (just do nothing)
            src = "var config; Ext.require(config, function() {})";
            extFile = (new Parser()).parse(src, 'test');
        });

        it('should detect Ext.ClassManager.addNameAlternateMappings calls', function() {
            var src, extFile;

            src = "Ext.ClassManager.addNameAlternateMappings({ 'A': [], 'B': [ 'C' ], 'D': [ 'F', 'E' ], 'G': [ 'I', 'H' ] });"
                + "var bla = 'someOtherCode';"
                + "Ext.ClassManager.addNameAlternateMappings({ 'G': [ 'J', 'H' ] })";
            extFile = (new Parser()).parse(src, 'test');
            assert.deepEqual({ 'B': [ 'C' ], 'D': [ 'E', 'F' ], 'G': [ 'H', 'I', 'J' ] }, extFile.aliasNames);

            // Don't fail for dynamic Ext.ClassManager.addNameAlternateMappings calls (just do nothing)
            src = "Ext.ClassManager.addNameAlternateMappings(Ext._alternatesMetadata);";
            extFile = (new Parser()).parse(src, 'test');
        });

        it('should detect oldschool stuff in comments', function() {
            var src, extFile;

            src = "// @define A\n" +
                  "/**\n" +
                  " * @alternateClassName B\n" +
                  " */" +
                  "// @require C  \n" +
                  "// @require   D  \n" +
                  "";
            extFile = (new Parser()).parse(src, 'test');
            assert.deepEqual([ 'A', 'B' ], extFile.names);
            assert.deepEqual([ 'C', 'D' ], extFile.requires);
        });

    });
});

function assertLastWarnIncludes(msgPart) {
    if (!testLogger.lastWarn || !testLogger.lastWarn.includes(msgPart)) {
        assert.fail(testLogger.lastWarn, msgPart, 'Expected warn log contains "' + msgPart + '"');
    }
}

function assertNoWarn() {
    if (testLogger.lastWarn) {
        assert.fail(testLogger.lastWarn, '', 'Expected no warn log');
    }
}
