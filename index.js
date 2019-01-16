/* eslint-env node */
'use strict';

module.exports = {
  name: 'ember-cognito',
  options: {
    nodeAssets: {
      'amazon-cognito-identity-js': function() {
        return {
          vendor: {
            srcDir: 'dist',
            include: [
              'aws-cognito-sdk.js',
              'amazon-cognito-identity.min.js',
              'amazon-cognito-identity.min.js.map'
            ]
          }
        };
      },
      'js-sha256': function() {
        return {
          vendor: {
            srcDir: 'src',
            include: [
              'sha256.js'
            ]
          }
        };
      }
    }
  },
  included: function(app) {
    this._super.included.apply(this, arguments);
    app.import('vendor/amazon-cognito-identity-js/aws-cognito-sdk.js');
    app.import('vendor/amazon-cognito-identity-js/amazon-cognito-identity.min.js');
    app.import('vendor/shims/amazon-cognito-identity-js.js');
    app.import('vendor/js-sha256/sha256.js');
    app.import('vendor/shims/js-sha256.js');
  }
};
