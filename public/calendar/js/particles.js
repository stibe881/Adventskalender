class ParticleField {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.particles = [];
    this.ambientType = null;
    this.running = false;
    this.lastSpawn = 0;
    this.wind = 0; // Gyroscope wind
    this.resize();
    window.addEventListener("resize", () => this.resize());
    window.addEventListener("deviceorientation", (e) => {
      // gamma is left-to-right tilt in degrees, where right is positive
      if (e.gamma !== null) {
        this.wind = e.gamma / 30; // Scale down
      }
    });
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

  stop() {
    this.running = false;
    this.particles = [];
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }

  spawnAmbient() {
    const w = this.canvas.width;
    const h = this.canvas.height;
    if (this.ambientType === "snow") {
      this.particles.push({
        kind: "snow",
        x: Math.random() * w,
        y: -10,
        r: 1.5 + Math.random() * 3,
        vy: 0.35 + Math.random() * 0.9,
        phase: Math.random() * Math.PI * 2,
        opacity: 0.35 + Math.random() * 0.5,
      });
    } else if (this.ambientType === "hearts") {
      this.particles.push({
        kind: "heart",
        x: Math.random() * w,
        y: h + 10,
        r: 6 + Math.random() * 9,
        vy: -(0.25 + Math.random() * 0.45),
        drift: Math.random() * 1.2 - 0.6,
        phase: Math.random() * Math.PI * 2,
        opacity: 0.18 + Math.random() * 0.32,
        color: Math.random() < 0.6 ? "#e9c76c" : "#d4586f",
        life: 0,
      });
    } else if (this.ambientType === "sparkle") {
      this.particles.push({
        kind: "sparkle",
        x: Math.random() * w,
        y: Math.random() * h,
        r: 0.8 + Math.random() * 1.6,
        life: 0,
        maxLife: 120 + Math.random() * 140,
        vy: -(0.05 + Math.random() * 0.15),
      });
    }
  }

  burst(x, y, colors, count = 52) {
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 2 + Math.random() * 5.5;
      this.particles.push({
        kind: "confetti",
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 2.5,
        size: 4 + Math.random() * 5,
        rotation: Math.random() * Math.PI,
        rotSpeed: (Math.random() - 0.5) * 0.3,
        color: colors[Math.floor(Math.random() * colors.length)],
        life: 0,
        maxLife: 75 + Math.random() * 35,
      });
    }
  }

  loop(t) {
    if (!this.running) return;
    const ctx = this.ctx;
    const w = this.canvas.width;
    const h = this.canvas.height;
    ctx.clearRect(0, 0, w, h);

    const spawnEvery = this.ambientType === "sparkle" ? 160 : 95;
    if (this.ambientType && t - this.lastSpawn > spawnEvery && this.particles.length < 170) {
      this.spawnAmbient();
      this.lastSpawn = t;
    }

    this.particles = this.particles.filter((p) => {
      if (p.kind === "snow") {
        p.y += p.vy;
        p.x += Math.sin(p.phase + p.y * 0.01) * 0.6 + this.wind;
        if (p.y > h + 10) return false;
        // wrap around X
        if (p.x > w) p.x = 0;
        if (p.x < 0) p.x = w;
        
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
        if (p.y < -20 || p.life > 1100) return false;
        ctx.globalAlpha = p.opacity;
        ctx.font = `${p.r * 2}px serif`;
        ctx.fillStyle = p.color;
        ctx.fillText("♥", p.x, p.y);
        return true;
      }
      if (p.kind === "sparkle") {
        p.life += 1;
        p.y += p.vy;
        const ratio = p.life / p.maxLife;
        if (ratio >= 1) return false;
        ctx.globalAlpha = Math.sin(ratio * Math.PI) * 0.8;
        ctx.fillStyle = "#f3d98b";
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fill();
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
