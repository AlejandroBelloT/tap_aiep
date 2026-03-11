import { Geist } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/context/AuthContext";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

export const metadata = {
  title: "Sistema de Gestión de Insumos",
  description: "Sistema de Gestión de Insumos y Asignación",
};

export default function RootLayout({ children }) {
  return (
    <html lang="es">
      <body className={`${geistSans.variable} antialiased`}>
        {/*
          AuthProvider envuelve toda la app.
          Provee sesión, perfil y utilidades de auth a todos los componentes.
        */}
        <AuthProvider>
          {children}
        </AuthProvider>
      </body>
    </html>
  );
}
