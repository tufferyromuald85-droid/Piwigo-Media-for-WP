# Security Policy

## Supported Versions

| Version | Supported |
|---------|-----------|
| 1.2.x   | ✅ Yes     |
| < 1.2   | ❌ No      |

## Reporting a Vulnerability

**Please do not open a public GitHub issue for security vulnerabilities.**

Report security issues privately by email:

**alert@prudente-consulting.com.br**

Include in your report:
- Description of the vulnerability
- Steps to reproduce
- WordPress and PHP versions affected
- Potential impact

You will receive an acknowledgement within 48 hours. We aim to release a fix within 14 days for confirmed vulnerabilities.

## Scope

This plugin handles:
- Piwigo API key storage (AES-256-CBC encrypted in `wp_options`)
- A proxy endpoint serving Piwigo images (`/wp-json/piwigo-media/v1/proxy/{id}`)
- WordPress REST API routes requiring `upload_files` capability

Issues of particular interest: authentication bypass, proxy enumeration, API key exposure, privilege escalation.
