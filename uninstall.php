<?php
defined('WP_UNINSTALL_PLUGIN') or die('No direct access.');

delete_option('piwigo_media_server_url');
delete_option('piwigo_media_api_key_id_enc');
delete_option('piwigo_media_api_key_id_iv');
delete_option('piwigo_media_api_key_secret_enc');
delete_option('piwigo_media_api_key_secret_iv');
delete_option('piwigo_media_default_mode');
delete_option('piwigo_media_meta_mapping');
delete_option('piwigo_media_proxy_enabled');
