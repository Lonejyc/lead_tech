import { getDatabase, ref, onValue } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-database.js";
import { firebaseApp } from "./firebase-init.js";

const db = getDatabase(firebaseApp);
const zipListEl = document.getElementById("zip-list");

function renderZips(zipsByTimestamp) {
  zipListEl.innerHTML = "";

  const entries = Object.entries(zipsByTimestamp || {})
    .flatMap(([timestamp, files]) =>
      Object.values(files).map(zip => ({ ...zip, timestamp }))
    )
    .filter(zip => zip.status === "successful")
    .sort((a, b) => b.timestamp - a.timestamp);

  entries.forEach(zip => {
    const li = document.createElement("li");
    const a = document.createElement("a");
    a.href = zip.publicUrl;
    a.textContent = `${zip.tags} - ${new Date(zip.createdAt).toLocaleString()}`;
    li.appendChild(a);
    zipListEl.appendChild(li);
  });
}

onValue(ref(db, "jocelyn"), snapshot => {
  renderZips(snapshot.val());
});
