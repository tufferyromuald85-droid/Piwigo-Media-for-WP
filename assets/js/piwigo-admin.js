/* PiwigoMedia — settings page interactions */
(function () {
  'use strict';

  var cfg = window.piwigoAdminConfig || {};

  // Show/hide proxy option based on mode selection
  var modeInputs = document.querySelectorAll('input[name="default_mode"]');
  var proxyRow   = document.querySelector('.piwigo-proxy-row');

  function updateProxyVisibility() {
    if (!proxyRow) return;
    var mode = document.querySelector('input[name="default_mode"]:checked');
    proxyRow.style.display = (mode && mode.value === 'link') ? '' : 'none';
  }

  modeInputs.forEach(function (el) {
    el.addEventListener('change', updateProxyVisibility);
  });
  updateProxyVisibility();
}());
