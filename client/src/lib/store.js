// lib/store.js — постоянное хранилище контактов
// Контакты хранятся с pubKey чтобы работать без сервера

const CONTACTS_KEY = 'am_contacts_v2';

export const ContactStore = {
  // Загрузить контакты пользователя
  load(myUsername) {
    try {
      const all = JSON.parse(localStorage.getItem(CONTACTS_KEY) || '{}');
      return all[myUsername] || {};
      // Формат: { [contactID]: { pubKey, addedAt, alias? } }
    } catch { return {}; }
  },

  // Сохранить / обновить один контакт
  upsert(myUsername, contactID, data) {
    try {
      const all = JSON.parse(localStorage.getItem(CONTACTS_KEY) || '{}');
      if (!all[myUsername]) all[myUsername] = {};
      all[myUsername][contactID] = {
        ...all[myUsername][contactID],
        ...data,
        updatedAt: Date.now(),
      };
      localStorage.setItem(CONTACTS_KEY, JSON.stringify(all));
    } catch(e) { console.warn('[Store] upsert failed', e); }
  },

  // Удалить контакт
  remove(myUsername, contactID) {
    try {
      const all = JSON.parse(localStorage.getItem(CONTACTS_KEY) || '{}');
      if (all[myUsername]) delete all[myUsername][contactID];
      localStorage.setItem(CONTACTS_KEY, JSON.stringify(all));
    } catch {}
  },

  // Сохранить pubKey когда получили его от сервера или из P2P
  savePubKey(myUsername, contactID, pubKeyHex) {
    this.upsert(myUsername, contactID, { pubKey: pubKeyHex });
  },

  // Получить pubKey из локального кэша
  getPubKey(myUsername, contactID) {
    const c = this.load(myUsername);
    return c[contactID]?.pubKey || null;
  },
};
