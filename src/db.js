import { db } from "./firebase";
import {
  collection, addDoc, getDocs, deleteDoc,
  doc, query, orderBy, serverTimestamp,
} from "firebase/firestore";

// ── PACIENTES ────────────────────────────────────────────────────────────────
export async function getPacientes() {
  const snap = await getDocs(query(collection(db, "pacientes"), orderBy("nome")));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

export async function addPaciente(dados) {
  const ref = await addDoc(collection(db, "pacientes"), {
    ...dados,
    cadastradoEm: serverTimestamp(),
  });
  return ref.id;
}

export async function deletePaciente(id) {
  await deleteDoc(doc(db, "pacientes", id));
}

// ── PAGAMENTOS ───────────────────────────────────────────────────────────────
export async function getPagamentos() {
  const snap = await getDocs(query(collection(db, "pagamentos"), orderBy("criadoEm", "desc")));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

export async function addPagamento(dados) {
  const ref = await addDoc(collection(db, "pagamentos"), {
    ...dados,
    criadoEm: serverTimestamp(),
  });
  return ref.id;
}

export async function deletePagamento(id) {
  await deleteDoc(doc(db, "pagamentos", id));
}
