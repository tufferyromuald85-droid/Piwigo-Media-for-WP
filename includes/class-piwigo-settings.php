<?php
defined('ABSPATH') or die('No direct access.');

class Piwigo_Settings
{
  const SLUG      = 'piwigo-media';
  const OPTION_NS = 'piwigo_media_';

  // ── Lifecycle ─────────────────────────────────────────────────────────────
  public static function activate(): void
  {
    add_option(self::OPTION_NS . 'server_url',        '');
    add_option(self::OPTION_NS . 'api_key_id_enc',    '');
    add_option(self::OPTION_NS . 'api_key_id_iv',     '');
    add_option(self::OPTION_NS . 'api_key_secret_enc','');
    add_option(self::OPTION_NS . 'api_key_secret_iv', '');
    add_option(self::OPTION_NS . 'default_mode',      'import');
    add_option(self::OPTION_NS . 'proxy_enabled',     '0');
    add_option(self::OPTION_NS . 'meta_mapping',      serialize(array(
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

      // API Key ID — encrypt before storing (pkid-YYYYMMDD-xxxxxxxxxxxxxxxxxxxx)
      $raw_key_id = trim($_POST['api_key_id'] ?? '');
      if ($raw_key_id !== '' && !str_starts_with($raw_key_id, '•')) {
        self::store_field('api_key_id', $raw_key_id);
      }

      // API Key Secret — encrypt before storing (40-char alphanumeric)
      $raw_key_secret = trim($_POST['api_key_secret'] ?? '');
      if ($raw_key_secret !== '' && !str_starts_with($raw_key_secret, '•')) {
        self::store_field('api_key_secret', $raw_key_secret);
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

    $server_url       = get_option(self::OPTION_NS . 'server_url', '');
    $api_key_id_set   = (bool) get_option(self::OPTION_NS . 'api_key_id_enc', '');
    $api_key_sec_set  = (bool) get_option(self::OPTION_NS . 'api_key_secret_enc', '');
    $default_mode     = get_option(self::OPTION_NS . 'default_mode', 'import');
    $proxy_enabled = get_option(self::OPTION_NS . 'proxy_enabled', '0');
    $mapping_raw   = get_option(self::OPTION_NS . 'meta_mapping', '');
    $mapping       = $mapping_raw ? unserialize($mapping_raw) : array();

    include PIWIGO_MEDIA_DIR . 'templates/settings-page.php';
  }

  // ── API Key encryption ────────────────────────────────────────────────────

  /**
   * Encrypt and store one API key field ('api_key_id' or 'api_key_secret').
   */
  public static function store_field(string $field, string $value): void
  {
    $iv  = random_bytes(16);
    $enc = openssl_encrypt($value, 'AES-256-CBC', self::derive_cipher_key(), 0, $iv);
    update_option(self::OPTION_NS . $field . '_enc', base64_encode($enc));
    update_option(self::OPTION_NS . $field . '_iv',  base64_encode($iv));
  }

  /**
   * Decrypt and return one API key field.
   */
  public static function get_field(string $field): string
  {
    $enc = get_option(self::OPTION_NS . $field . '_enc', '');
    $iv  = get_option(self::OPTION_NS . $field . '_iv',  '');
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

  /**
   * Return the combined auth string expected by Piwigo: {pkid}:{secret}
   */
  public static function get_api_auth(): string
  {
    $id     = self::get_field('api_key_id');
    $secret = self::get_field('api_key_secret');
    if (!$id || !$secret) return '';
    return $id . ':' . $secret;
  }

  private static function derive_cipher_key(): string
  {
    return hash('sha256', defined('AUTH_KEY') ? AUTH_KEY : wp_salt('auth'), true);
  }
}
