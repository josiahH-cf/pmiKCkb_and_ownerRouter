import { getFirestore } from "firebase-admin/firestore";
import { getFirebaseAdminApp } from "@/lib/firebase/admin";

export function getAdminFirestore() {
  return getFirestore(getFirebaseAdminApp());
}
