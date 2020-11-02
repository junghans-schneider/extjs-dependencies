Ext.application({

    name: 'myapp',
    appFolder: 'app-src',

    requires: [
        'myapp.view.MyView'
    ],

    launch: function() {
        Ext.create('myapp.view.MyView').show();
    }

});
