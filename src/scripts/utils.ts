export function changeElementVisibility(
  element: HTMLElement,
  visible: "visible" | "hidden",
) {
  const other = visible === "visible" ? "hidden" : "visible";
  element.classList.add(visible);
  element.classList.remove(other);
  console.log("changed visibility");
}

export function getTheme() {
  const savedTheme = localStorage.getItem("theme");

  if (savedTheme) {
    return savedTheme;
  }

  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}
