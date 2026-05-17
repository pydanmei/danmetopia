import { DB } from "./db.js";

/* ================= USER ================= */
export function getUser(){
  return localStorage.getItem("user") || "anon";
}

/* ================= ANONYMOUS ================= */
export function getAnon(){
  let id = localStorage.getItem("anon");
  if(!id){
    id = "anon_" + Math.random().toString(36).slice(2);
    localStorage.setItem("anon", id);
  }
  return id;
}

/* ================= ROLE ================= */
export function getRole(){
  const u = getUser();

  if(u === "admin") return "admin";
  if(u.includes("@group")) return "group";
  return "user";
}

/* ================= FIND MANGA ================= */
export function getManga(id){
  return DB.manga.find(m => m.id == id);
}
