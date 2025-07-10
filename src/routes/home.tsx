import { useState } from "react";
import reactLogo from "../assets/react.svg";
import { invoke } from "@tauri-apps/api/tauri";
import { Button } from "../components/ui/button"

export default function Home() {
  const [greetMsg, setGreetMsg] = useState("");
  const [name, setName] = useState("");

  async function greet() {
    // Learn more about Tauri commands at https://tauri.app/v1/guides/features/command
    setGreetMsg(await invoke("greet", { name }));
  }

  return (
    <div className="flex flex-row h-full w-full m-10">
      <div>
        <div className="flex flex-col">
          <h1>Bienvenue sur Tauri !</h1>
        
          <form
            className="flex flex-row pt-5 gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              greet();
            }}
          >
            <input
              id="greet-input"
              onChange={(e) => setName(e.currentTarget.value)}
              placeholder="Entrez un nom..."
            />
            <Button type="submit">Saluer</Button>
          </form>

          <p>{greetMsg}</p>
        </div>
      </div>
    </div>
  );
}
