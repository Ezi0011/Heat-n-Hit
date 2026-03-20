console.log("JS chargé");

    const status = document.getElementById("status");
    const buttons = document.querySelectorAll(".dir");
    const bomb = document.getElementById("shootBtn");

    buttons.forEach(btn => {
      const dir = btn.dataset.direction;

      btn.addEventListener("click", () => {
        console.log("move", dir);
        status.textContent = "move " + dir;
      });
    });

    bomb.addEventListener("click", () => {
      console.log("bomb");
      status.textContent = "bomb";
    });