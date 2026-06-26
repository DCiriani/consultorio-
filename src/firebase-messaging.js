import { getMessaging, isSupported } from "firebase/messaging";

// Reaproveita o app Firebase já inicializado no App.jsx.
// Esse arquivo só adiciona a parte de Cloud Messaging (push notifications),
// sem duplicar a inicialização do Firestore/Auth que já existe.
export async function getMessagingIfSupported(firebaseApp) {
  const suportado = await isSupported();
  if (!suportado) return null;
  return getMessaging(firebaseApp);
}
