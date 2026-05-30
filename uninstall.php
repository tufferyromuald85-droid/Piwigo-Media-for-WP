<?php
defined('WP_UNINSTALL_PLUGIN') or die('No direct access.');

delete_option('piwigo_media_server_url');
delete_option('piwigo_media_api_key_enc');
delete_option('piwigo_media_api_key_iv');
delete_option('piwigo_media_default_mode');
delete_option('piwigo_media_meta_mapping');
delete_option('piwigo_media_proxy_enabled');
