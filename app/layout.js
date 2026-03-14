import "./globals.css";

export const metadata = {
  title: "Sea Skipper Trainer",
  description: "Learning and testing app for Sea Skipper questions"
};

export default function RootLayout({ children }) {
  return (
    <html lang="ro">
      <body>{children}</body>
    </html>
  );
}
