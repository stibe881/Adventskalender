class ParticleField {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.particles = [];
    this.ambientType = null;
    this.running = false;
    this.lastSpawn = 0;
    this.resize();
    window.addEventListener("resize", () => this.resize());
  }

  resize() {
    this.canvas.width = window.innerWidth;
    this.canvas.height = window.innerHeight;
  }

  setAmbient(type) {
    this.ambientType = type;
  }

  start() {
    if (this.running) return;
    this.running = true;
    requestAnimationFrame((t) => this.loop(t));
  }

  spawnAmbient() {
    const w = this.canvas.width;
    const h = this.canvas.height;
    if (this.ambientType === "snow") {
      this.particles.push({
        kind: "snow",
        x: Math.random() * w,
        y: -10,
        r: 2 + Math.random() * 3,
        vy: 0.4 + Math.random() * 1,
        drift: Math.random() * 2 - 1,
        phase: Math.random() * Math.PI * 2,
        opacity: 0.4 + Math.random() * 0.5,
      });
    } else if (this.ambientType === "hearts") {
      this.particles.push({
        kind: "heart",
        x: Math.random() * w,
        y: h + 10,
        r: 8 + Math.random() * 10,
        vy: -(0.3 + Math.random() * 0.6),
        drift: Math.random() * 1.2 - 0.6,
        phase: Math.random() * Math.PI * 2,
        opacity: 0.25 + Math.random() * 0.4,
        life: 0,
      });
    }
  }

  burst(x, y, colors, count = 46) {
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 2 + Math.random() * 5;
      this.particles.push({
        kind: "confetti",
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 2,
        size: 4 + Math.random() * 5,
        rotation: Math.random() * Math.PI,
        rotSpeed: (Math.random() - 0.5) * 0.3,
        color: colors[Math.floor(Math.random() * colors.length)],
        life: 0,
        maxLife: 70 + Math.random() * 30,
      });
    }
  }

  loop(t) {
    const ctx = this.ctx;
    const w = this.canvas.width;
    const h = this.canvas.height;
    ctx.clearRect(0, 0, w, h);

    if (this.ambientType && t - this.lastSpawn > 90 && this.particles.length < 160) {
      this.spawnAmbient();
      this.lastSpawn = t;
    }

    this.particles = this.particles.filter((p) => {
      if (p.kind === "snow") {
        p.y += p.vy;
        p.x += Math.sin(p.phase + p.y * 0.01) * 0.6;
        if (p.y > h + 10) return false;
        ctx.globalAlpha = p.opacity;
        ctx.fillStyle = "#ffffff";
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fill();
        return true;
      }
      if (p.kind === "heart") {
        p.life += 1;
        p.y += p.vy;
        p.x += Math.sin(p.phase + p.life * 0.03) * p.drift;
        if (p.y < -20 || p.life > 900) return false;
        ctx.globalAlpha = p.opacity;
        ctx.font = `${p.r * 2}px serif`;
        ctx.fillStyle = "#f2c94c";
        ctx.fillText("♥", p.x, p.y);
        return true;
      }
      if (p.kind === "confetti") {
        p.life += 1;
        p.vy += 0.12;
        p.x += p.vx;
        p.y += p.vy;
        p.rotation += p.rotSpeed;
        const lifeRatio = p.life / p.maxLife;
        if (lifeRatio >= 1) return false;
        ctx.globalAlpha = 1 - lifeRatio;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rotation);
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.6);
        ctx.restore();
        return true;
      }
      return false;
    });

    ctx.globalAlpha = 1;
    requestAnimationFrame((t2) => this.loop(t2));
  }
}
