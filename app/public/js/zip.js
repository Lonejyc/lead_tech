let button = document.getElementById("zip-btn");

button.addEventListener("click", function () {
  let tags = new URLSearchParams(document.location.search).get("tags") || "";
  fetch('/zip?tags=' + encodeURIComponent(tags), { method: 'POST' })
});