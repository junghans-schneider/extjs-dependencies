Ext.define('myapp.view.MyView', {
    extend: 'Ext.view.View',
    requires:[
        'Ext.ClassWithAlias',
        'Ext.ClassWithAliasTwo',
        'myapp.view.MyViewModel'
    ],
    mixins: {
        observable: 'Ext.util.Observable'
    }
});
