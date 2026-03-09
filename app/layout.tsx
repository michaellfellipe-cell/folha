import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Folha — Sua jornada literária",
  description: "Descubra, organize e acompanhe sua vida literária com inteligência artificial.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt-BR">
      <body style={{ margin: 0, padding: 0, background: "#0F0D0B" }}>
        {children}
      </body>
    </html>
  );
}
