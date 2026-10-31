import { chatIdFor } from '../phone.js';
import { messageIdOf, waha } from '../waha.js';
import type { MessengerProvider } from './index.js';

export const whatsapp: MessengerProvider = {
  id: 'whatsapp',
  title: 'WhatsApp',
  addressFor: chatIdFor,
  async send(session, to, content) {
    return messageIdOf(await waha.send(session, to, content));
  },
  async exists(session, phone) {
    return (await waha.checkExists(session, phone)).numberExists;
  },
};
