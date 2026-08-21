import { redirect } from "next/navigation";

// 순위는 /study 한 페이지로 합쳐졌다. 공유된 옛 링크가 깨지지 않도록 앵커로 보낸다.
export default function RankingRedirect() {
  redirect("/study#ranking");
}
