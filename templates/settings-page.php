<?php defined('ABSPATH') or die('No direct access.'); ?>
<div class="wrap">
  <h1>
    <img src="<?= esc_url(PIWIGO_MEDIA_URL . 'assets/images/piwigo-color.svg') ?>"
         width="36" height="36"
         style="vertical-align:middle;margin-right:10px;margin-bottom:2px"
         alt="">
    Piwigo Media — Settings
  </h1>

  <?php if ($message): ?>
    <div class="notice notice-success is-dismissible"><p><?= esc_html($message) ?></p></div>
  <?php endif; ?>
  <?php if ($error): ?>
    <div class="notice notice-error is-dismissible"><p><?= esc_html($error) ?></p></div>
  <?php endif; ?>

  <form method="post" action="">
    <?php wp_nonce_field('piwigo_media_settings', 'piwigo_media_nonce'); ?>

    <table class="form-table" role="presentation">
      <tr>
        <th scope="row"><label for="server_url">Piwigo server URL</label></th>
        <td>
          <input type="url" id="server_url" name="server_url"
                 class="regular-text" value="<?= esc_attr($server_url) ?>"
                 placeholder="https://photos.mysite.com">
          <p class="description">Root URL of your Piwigo gallery (no trailing slash).</p>
        </td>
      </tr>
      <tr>
        <th scope="row"><label for="api_key_id">Piwigo API Key — ID</label></th>
        <td>
          <input type="text" id="api_key_id" name="api_key_id"
                 class="regular-text"
                 value="<?= $api_key_id_set ? esc_attr(str_repeat('•', 32)) : '' ?>"
                 placeholder="pkid-YYYYMMDD-xxxxxxxxxxxxxxxxxxxx"
                 autocomplete="off">
          <p class="description">
            The key identifier shown in Piwigo: <em>Admin → Users → Profile → API Keys</em>.<br>
            Format: <code>pkid-YYYYMMDD-xxxxxxxxxxxxxxxxxxxx</code> — leave blank to keep existing.
          </p>
        </td>
      </tr>
      <tr>
        <th scope="row"><label for="api_key_secret">Piwigo API Key — Secret</label></th>
        <td>
          <input type="password" id="api_key_secret" name="api_key_secret"
                 class="regular-text"
                 value="<?= $api_key_sec_set ? esc_attr(str_repeat('•', 40)) : '' ?>"
                 placeholder="40-character secret"
                 autocomplete="off">
          <p class="description">
            The secret shown <strong>once</strong> when the key is created in Piwigo.<br>
            Leave blank to keep the existing secret.
          </p>
        </td>
      </tr>
      <tr>
        <th scope="row">Default insertion mode</th>
        <td>
          <fieldset>
            <label>
              <input type="radio" name="default_mode" value="import"
                <?= $default_mode === 'import' ? 'checked' : '' ?>>
              <strong>Import</strong> — copy file to WP Media Library
            </label><br>
            <label>
              <input type="radio" name="default_mode" value="link"
                <?= $default_mode === 'link' ? 'checked' : '' ?>>
              <strong>Link</strong> — reference Piwigo URL directly
            </label>
          </fieldset>
        </td>
      </tr>
      <tr>
        <th scope="row">Private albums (link mode)</th>
        <td>
          <label>
            <input type="checkbox" name="proxy_enabled" value="1"
              <?= $proxy_enabled === '1' ? 'checked' : '' ?>>
            Enable WP proxy for private Piwigo albums
          </label>
          <p class="description">When enabled, images are served through WordPress so albums with access restrictions remain accessible.</p>
        </td>
      </tr>
      <tr>
        <th scope="row">Metadata mapping</th>
        <td>
          <fieldset>
            <label><input type="checkbox" name="meta_title" <?= !empty($mapping['title']) ? 'checked' : '' ?>> Import photo title</label><br>
            <label><input type="checkbox" name="meta_description" <?= !empty($mapping['description']) ? 'checked' : '' ?>> Import description / caption</label><br>
            <label><input type="checkbox" name="meta_tags" <?= !empty($mapping['tags']) ? 'checked' : '' ?>> Import tags</label><br>
            <label><input type="checkbox" name="meta_exif" <?= !empty($mapping['exif']) ? 'checked' : '' ?>> Import EXIF data (date, GPS, camera)</label><br>
            <label><input type="checkbox" name="meta_alt_auto" <?= !empty($mapping['alt_auto']) ? 'checked' : '' ?>> Auto-generate alt text from title</label>
          </fieldset>
        </td>
      </tr>
    </table>

    <p class="submit">
      <input type="submit" class="button-primary" value="Save settings">
      <input type="submit" name="test_connection" class="button-secondary" value="Test Piwigo connection" style="margin-left:8px">
    </p>
  </form>
</div>
