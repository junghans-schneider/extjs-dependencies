var assert = require('assert');
var Parser = require('../lib/parser');


describe('Parser', function() {
    describe('#parse(src,filePath)', function() {
        it('should detect simple class (single requires / uses)', function() {
            src = "Ext.define('MyClass', { extend: 'A', requires: 'B', uses: 'C' })";
            var extFile = (new Parser()).parse(src, 'test');
            assert.deepEqual([ 'MyClass' ], extFile.names);
            assert.equal('A', extFile.parentName);
            assert.deepEqual([ 'A', 'B' ], extFile.requires);
            assert.deepEqual([ 'C' ], extFile.uses);
        });
        it('should detect simple class (multi requires / uses)', function() {
            src = "Ext.define('MyClass', { extend: 'A', requires: [ 'C', 'B' ], uses: [ 'D', 'E', 'D' ] })";
            var extFile = (new Parser()).parse(src, 'test');
            assert.deepEqual([ 'MyClass' ], extFile.names);
            assert.equal('A', extFile.parentName);
            assert.deepEqual([ 'A', 'B', 'C' ], extFile.requires);
            assert.deepEqual([ 'D', 'E' ], extFile.uses);
        });
    });
});
