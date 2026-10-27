export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="bg-[#F9F6F2] text-[#1A1A1A]">
        {children}
      </body>
    </html>
  );
}
