(function() {
  function vendorModule() {
    'use strict';

    return {
      'default': self['js-sha256'],
      __esModule: true,
    };
  }

  define('js-sha256', [], vendorModule);
})();
