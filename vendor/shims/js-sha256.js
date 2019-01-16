(function() {
  function vendorModule() {
    'use strict';

    return {
      'default': self['js-sha256'],
      __esModule: true,
      sha256: sha256
    };
  }

  define('js-sha256', [], vendorModule);
})();
