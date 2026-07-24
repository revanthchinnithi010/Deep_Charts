# TradeVault — Store Metadata

Production release metadata placeholders. Fill in before submitting to the
App Store or Google Play. Do **not** invent values — all fields below are
intentional placeholders that require real content.

---

## App Identity

| Field              | Value                        | Status          |
|--------------------|------------------------------|-----------------|
| App Name           | TradeVault                   | ✅ Confirmed    |
| Bundle Identifier  | com.tradevault.app           | ✅ Confirmed    |
| Package Name       | com.tradevault.app           | ✅ Confirmed    |
| App Scheme         | tradevault                   | ✅ Confirmed    |
| Version            | 1.0.0                        | ✅ Confirmed    |
| Build Number       | _Set via EAS `autoIncrement`_| ⬜ Auto         |
| EAS Project ID     | YOUR_EAS_PROJECT_ID          | ❌ Needs value  |

---

## App Store (iOS)

### Classification

| Field              | Value                        | Status          |
|--------------------|------------------------------|-----------------|
| Primary Category   | Finance                      | ⬜ Confirm      |
| Secondary Category | Productivity                 | ⬜ Confirm      |
| Rating             | 4+ (no mature content)       | ⬜ Confirm      |
| Content Rights     | Does not use third-party content | ⬜ Confirm  |

### Metadata

| Field              | Placeholder                  | Status          |
|--------------------|------------------------------|-----------------|
| App Store Name     | TradeVault                   | ✅ Confirmed    |
| Subtitle           | _[30 chars max — fill in]_   | ❌ Needs content|
| Promotional Text   | _[170 chars max — fill in]_  | ❌ Needs content|
| Description        | _[4000 chars max — fill in]_ | ❌ Needs content|
| Keywords           | _[100 chars — fill in]_      | ❌ Needs content|
| Support URL        | _[Your support URL]_         | ❌ Needs URL    |
| Marketing URL      | _[Your website URL]_         | ❌ Optional     |
| Privacy Policy URL | _[Your privacy policy URL]_  | ❌ Required     |

### Release Notes (v1.0.0)

```
[Fill in release notes before submission]
```

### Screenshots Required

| Device             | Count | Dimensions          | Status          |
|--------------------|-------|---------------------|-----------------|
| iPhone 6.9"        | 3–10  | 1320 × 2868 px      | ❌ Needed       |
| iPhone 6.7"        | 3–10  | 1290 × 2796 px      | ❌ Needed       |
| iPad 13"           | 3–10  | 2064 × 2752 px      | ❌ Needed       |
| iPad 12.9"         | 3–10  | 2048 × 2732 px      | ❌ Needed       |

> Screenshots must not show competitor apps, real account balances, or
> personally identifiable account data.

### App Preview Video (optional)

| Device             | Duration | Format    | Status          |
|--------------------|----------|-----------|-----------------|
| iPhone 6.9"        | 15–30s   | .mov/.mp4 | ⬜ Optional     |

---

## Google Play (Android)

### Classification

| Field              | Value                        | Status          |
|--------------------|------------------------------|-----------------|
| Category           | Finance                      | ⬜ Confirm      |
| Content Rating     | Everyone                     | ⬜ Complete questionnaire |
| Target Age Group   | General                      | ⬜ Confirm      |

### Metadata

| Field              | Placeholder                  | Status          |
|--------------------|------------------------------|-----------------|
| App Title          | TradeVault                   | ✅ Confirmed    |
| Short Description  | _[80 chars max — fill in]_   | ❌ Needs content|
| Full Description   | _[4000 chars max — fill in]_ | ❌ Needs content|
| Privacy Policy URL | _[Your privacy policy URL]_  | ❌ Required     |

### Release Notes (v1.0.0)

```
[Fill in release notes before submission]
```

### Graphic Assets Required

| Asset              | Dimensions          | Status          |
|--------------------|---------------------|-----------------|
| Feature Graphic    | 1024 × 500 px       | ❌ Needed       |
| App Icon (hi-res)  | 512 × 512 px        | ❌ Needed       |

> Adaptive icon foreground: `./assets/images/icon.png` (configured in app.json)
> Adaptive icon background color: `#0d1117`

### Screenshots Required

| Form Factor        | Count  | Dimensions            | Status          |
|--------------------|--------|-----------------------|-----------------|
| Phone              | 2–8    | 1080 × 1920 px min    | ❌ Needed       |
| 7" Tablet          | 2–8    | 1200 × 1920 px min    | ⬜ Recommended  |
| 10" Tablet         | 2–8    | 1920 × 1200 px min    | ❌ Needed       |

---

## Legal & Compliance

| Document           | Requirement  | Status          |
|--------------------|--------------|-----------------|
| Privacy Policy     | Required     | ❌ Needs URL    |
| Terms of Service   | Recommended  | ❌ Needs URL    |
| Support URL        | Required     | ❌ Needs URL    |
| Data Safety Form   | Required (Play) | ❌ Fill in   |
| App Privacy Labels | Required (App Store) | ❌ Fill in |

### Data Safety (Google Play)

Declare accurately based on what the app actually collects:

- [ ] Crash logs collected and shared with Sentry (optional — only if Sentry is enabled)
- [ ] Analytics data (optional — only if PostHog is enabled)
- [ ] No financial data collected by the app publisher
- [ ] No location data collected
- [ ] No contacts collected

### Privacy Nutrition Labels (App Store)

- [ ] Crash data (if Sentry enabled)
- [ ] Usage data / analytics (if PostHog enabled)
- [ ] No financial information collected by publisher

---

## Signing & Distribution

| Asset                          | Status          |
|--------------------------------|-----------------|
| Apple Developer Account        | ❌ Needs setup  |
| iOS Distribution Certificate   | ❌ EAS managed  |
| iOS Provisioning Profile       | ❌ EAS managed  |
| Android Keystore               | ❌ EAS managed  |
| Google Play Service Account    | ❌ Needs setup  |
| `google-service-account.json`  | ❌ Not committed (add to EAS secrets) |
