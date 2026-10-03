// Phone features: reminders as real Android notifications, and sharing exported reports.
import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';

export const isNative = Capacitor.isNativePlatform();
const CHANNEL = 'pd-reminders';
let channelReady = false;

export async function notifPermission() {
  if (!isNative) return 'unsupported';
  try { return (await LocalNotifications.checkPermissions()).display; } catch (e) { return 'unsupported'; }
}
export async function askNotifPermission() {
  if (!isNative) return 'unsupported';
  try { return (await LocalNotifications.requestPermissions()).display; } catch (e) { return 'denied'; }
}
async function ensureChannel() {
  if (channelReady || !isNative) return;
  try { await LocalNotifications.createChannel({ id: CHANNEL, name: 'Payment & contract reminders', description: 'Rent, installments, cheques and contract expiry', importance: 4, visibility: 1, vibration: true }); } catch (e) {}
  channelReady = true;
}

// Replaces all scheduled reminders with the given list: [{id, at: Date, title, body, extra}]
export async function replaceReminders(list) {
  if (!isNative) return { ok: false, reason: 'unsupported' };
  if ((await notifPermission()) !== 'granted') return { ok: false, reason: 'permission' };
  await ensureChannel();
  try {
    const pending = await LocalNotifications.getPending();
    if (pending.notifications.length) await LocalNotifications.cancel({ notifications: pending.notifications.map(n => ({ id: n.id })) });
    if (list.length) await LocalNotifications.schedule({
      notifications: list.map(n => ({ id: n.id, title: n.title, body: n.body, largeBody: n.body, channelId: CHANNEL, extra: n.extra || null,
        schedule: { at: n.at, allowWhileIdle: true }, isExactNotification: false, autoCancel: true }))
    });
    return { ok: true, count: list.length };
  } catch (e) { return { ok: false, reason: String(e && e.message || e) }; }
}
export async function testNotification() {
  if (!isNative) return false;
  await ensureChannel();
  try {
    await LocalNotifications.schedule({ notifications: [{ id: 999999, title: 'Property Desk reminders are on', body: 'You will be reminded about due payments, cheques and expiring contracts.', channelId: CHANNEL, schedule: { at: new Date(Date.now() + 3000), allowWhileIdle: true }, isExactNotification: false }] });
    return true;
  } catch (e) { return false; }
}
export function onNotificationTap(cb) {
  if (!isNative) return;
  LocalNotifications.addListener('localNotificationActionPerformed', a => cb(a.notification && a.notification.extra));
}

// Saves a CSV and opens the Android share sheet (WhatsApp, email, Drive, Files…).
export async function shareFile(filename, text) {
  if (!isNative) {
    const url = URL.createObjectURL(new Blob([text], { type: 'text/csv' }));
    const a = document.createElement('a'); a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000); return true;
  }
  const r = await Filesystem.writeFile({ path: filename, data: text, directory: Directory.Cache, encoding: Encoding.UTF8 });
  await Share.share({ title: filename, files: [r.uri], dialogTitle: 'Share report' });
  return true;
}
