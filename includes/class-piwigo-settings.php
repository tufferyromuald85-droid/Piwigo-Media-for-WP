<?php
defined('ABSPATH') or die('No direct access.');

class Piwigo_Settings
{
  const SLUG      = 'piwigo-media';
  const OPTION_NS = 'piwigo_media_';

  // ── Lifecycle ─────────────────────────────────────────────────────────────
  public static function activate(): void
  {
    add_option(self::OPTION_NS . 'server_url',     '');
    add_option(self::OPTION_NS . 'default_mode',   'import');
    add_option(self::OPTION_NS . 'proxy_enabled',  '0');
    add_option(self::OPTION_NS . 'meta_mapping',   serialize(array(
      'title'       => true,
      'description' => true,
      'tags'        => true,
      'exif'        => true,
      'alt_auto'    => true,
    )));
  }

  public static function deactivate(): void {}

  public static function init(): void {}

  // ── Admin menu ────────────────────────────────────────────────────────────
  public static function add_menu(): void
  {
    add_options_page(
      'Piwigo Media Settings',
      'Piwigo Media',
      'manage_options',
      self::SLUG,
      array(self::class, 'render_page')
    );
  }

  // ── Settings page render ──────────────────────────────────────────────────
  public static function render_page(): void
  {
    if (!current_user_can('manage_options')) {
      wp_die('Insufficient permissions.');
    }

    $message = '';
    $error   = '';

    if (isset($_POST['piwigo_media_nonce']) && wp_verify_nonce($_POST['piwigo_media_nonce'], 'piwigo_media_settings')) {
      // Server URL
      $server_url = esc_url_raw(trim($_POST['server_url'] ?? ''));
      update_option(self::OPTION_NS . 'server_url', rtrim($server_url, '/'));

      // API Key — encrypt before storing
      $raw_key = trim($_POST['api_key'] ?? '');
      if ($raw_key !== '' && $raw_key !== str_repeat('•', 32)) {
        self::store_api_key($raw_key);
      }

      update_option(self::OPTION_NS . 'default_mode',  in_array($_POST['default_mode'] ?? '', array('link', 'import')) ? $_POST['default_mode'] : 'import');
      update_option(self::OPTION_NS . 'proxy_enabled', isset($_POST['proxy_enabled']) ? '1' : '0');

      $mapping = array(
        'title'       => isset($_POST['meta_title']),
        'description' => isset($_POST['meta_description']),
        'tags'        => isset($_POST['meta_tags']),
        'exif'        => isset($_POST['meta_exif']),
        'alt_auto'    => isset($_POST['meta_alt_auto']),
      );
      update_option(self::OPTION_NS . 'meta_mapping', serialize($mapping));

      $message = 'Settings saved.';
    }

    if (isset($_POST['test_connection'])) {
      if (!wp_verify_nonce($_POST['piwigo_media_nonce'] ?? '', 'piwigo_media_settings')) {
        wp_die('Security check failed.');
      }
      $api = new Piwigo_Api();
      $ok  = $api->test_connection();
      if ($ok === true) {
        $message = 'Connection to Piwigo successful!';
      } else {
        $error = 'Connection failed: ' . esc_html($ok);
      }
    }

    $server_url    = get_option(self::OPTION_NS . 'server_url', '');
    $api_key_set   = (bool) get_option(self::OPTION_NS . 'api_key_enc', '');
    $default_mode  = get_option(self::OPTION_NS . 'default_mode', 'import');
    $proxy_enabled = get_option(self::OPTION_NS . 'proxy_enabled', '0');
    $mapping_raw   = get_option(self::OPTION_NS . 'meta_mapping', '');
    $mapping       = $mapping_raw ? unserialize($mapping_raw) : array();

    include PIWIGO_MEDIA_DIR . 'templates/settings-page.php';
  }

  // ── API Key encryption ────────────────────────────────────────────────────
  public static function store_api_key(string $key): void
  {
    $iv  = random_bytes(16);
    $enc = openssl_encrypt($key, 'AES-256-CBC', self::derive_cipher_key(), 0, $iv);
    update_option(self::OPTION_NS . 'api_key_enc', base64_encode($enc));
    update_option(self::OPTION_NS . 'api_key_iv',  base64_encode($iv));
  }

  public static function get_api_key(): string
  {
    $enc = get_option(self::OPTION_NS . 'api_key_enc', '');
    $iv  = get_option(self::OPTION_NS . 'api_key_iv',  '');
    if (!$enc || !$iv) return '';

    $plain = openssl_decrypt(
      base64_decode($enc),
      'AES-256-CBC',
      self::derive_cipher_key(),
      0,
      base64_decode($iv)
    );
    return $plain !== false ? $plain : '';
  }

  private static function derive_cipher_key(): string
  {
    // Derive 32-byte cipher key from WordPress AUTH_KEY constant
    return hash('sha256', defined('AUTH_KEY') ? AUTH_KEY : wp_salt('auth'), true);
  }
}
