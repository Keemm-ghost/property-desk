# Property Desk

Android app for property owners. It covers properties, contracts, installments, cheques, payment reminders, history and reports. Data is stored in your own free Google Firebase cloud.

## Build the APK on GitHub

1. In your GitHub repository, click **Add file → Upload files**.
   - Select **all 17 files** from this zip. There are no folders.
   - Click **Commit changes**.
2. Open the **Actions** tab.
   - Click **New workflow**, then **set up a workflow yourself**.
   - Delete the text in the editor.
   - Open `build-apk.yml` from this zip in Notepad or TextEdit, copy all of it, and paste it in.
   - Click **Commit changes** (top right), then **Commit changes** again.
3. The build starts automatically and takes 5–10 minutes. When it shows a green tick, open **Releases** on the repository's main page and download **PropertyDesk.apk** on your phone.

If the build fails with "These files are missing", upload the files it names and it will run again.

## First launch
1. Paste your Firebase config.
2. Sign in.
3. In Settings, turn on reminders.
4. Add your first property.
