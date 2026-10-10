import { Atkinson_Hyperlegible_Next, Bricolage_Grotesque, JetBrains_Mono } from "next/font/google";

/** Brand fonts, shared by the root layout and global-error (which renders its own <html>). */
const atkinson = Atkinson_Hyperlegible_Next({ variable: "--font-atkinson", subsets: ["latin"] });
const bricolage = Bricolage_Grotesque({ variable: "--font-bricolage", subsets: ["latin"] });
const jetbrains = JetBrains_Mono({ variable: "--font-jetbrains", subsets: ["latin"], weight: ["400", "500"] });

export const fontVariables = `${atkinson.variable} ${bricolage.variable} ${jetbrains.variable}`;
