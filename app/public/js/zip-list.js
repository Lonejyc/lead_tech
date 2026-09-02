import { getDatabase, ref, onValue } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-database.js";
import { firebaseApp } from "./firebase-init.js";

const db = getDatabase(firebaseApp);
const zipListEl = document.getElementById("zip-list");
const showMoreBtn = document.getElementById("zip-list-show-more");

const PAGE_SIZE = 5;
const LOAD_MORE_SIZE = 50;
let allEntries = [];
let visibleCount = PAGE_SIZE;

function renderZips() {
  zipListEl.innerHTML = "";

  allEntries.slice(0, visibleCount).forEach(zip => {
    const li = document.createElement("li");
    const a = document.createElement("a");
    a.href = zip.publicUrl;
    a.textContent = `${zip.tags} - ${new Date(zip.createdAt).toLocaleString()}`;
    li.appendChild(a);
    zipListEl.appendChild(li);
  });

  showMoreBtn.hidden = visibleCount >= allEntries.length;
}

showMoreBtn.addEventListener("click", () => {
  visibleCount += LOAD_MORE_SIZE;
  renderZips();
});

onValue(ref(db, "jocelyn"), snapshot => {
  allEntries = Object.entries(snapshot.val() || {})
    .flatMap(([timestamp, files]) =>
      Object.values(files).map(zip => ({ ...zip, timestamp }))
    )
    .filter(zip => zip.status === "successful")
    .sort((a, b) => b.timestamp - a.timestamp);

  visibleCount = PAGE_SIZE;
  renderZips();
});
