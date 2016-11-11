'use strict';

var assert = require('assert');
var Parser = require('../lib/parser');


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
            src = "Ext.define('MyModel', { extend: 'Ext.data.Model', hasMany: 'unsupported-stuff' })";
            extFile = (new Parser()).parse(src, 'test');
            assert.deepEqual([ 'MyModel' ], extFile.names);
            assert.deepEqual([ 'Ext.data.Model', 'Ext.data.association.HasMany' ], extFile.requires);
            assert.deepEqual([], extFile.uses);
        });

    });
});
