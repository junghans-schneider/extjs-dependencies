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

        it('should detect simple class with requires and uses', function() {
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
