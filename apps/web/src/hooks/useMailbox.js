import { useContext } from 'react';
import { MailboxContext } from '../state/mailboxContext.js';

export function useMailbox() {
  return useContext(MailboxContext);
}
