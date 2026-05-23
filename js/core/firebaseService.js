import { 
  db, auth, 
  ref, set, get, child, push, update, remove, onValue, off 
} from './firebase.js';

export const FirebaseService = {
  db,
  auth,
  ref,
  set,
  get,
  child,
  push,
  update,
  remove,
  onValue,
  off
};
