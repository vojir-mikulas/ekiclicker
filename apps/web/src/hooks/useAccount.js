import { useContext } from 'react';
import { AccountContext } from '../state/accountContext.js';

export function useAccount() {
  return useContext(AccountContext);
}
