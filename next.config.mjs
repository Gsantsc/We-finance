/** @type {import('next').NextConfig} */
const nextConfig = {
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          // Forca HTTPS por 2 anos (inclui subdominios) apos a primeira visita.
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
          // Navegador nao tenta adivinhar content-type de resposta.
          { key: "X-Content-Type-Options", value: "nosniff" },
          // App financeiro nunca deve rodar dentro de iframe (clickjacking).
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          // Nao usamos camera/microfone/geolocalizacao em lugar nenhum.
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
    ];
  },
};

export default nextConfig;
