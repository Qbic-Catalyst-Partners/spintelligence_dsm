import { useEffect } from "react";
import { useRouter } from "next/router";

const SCREEN_TYPE_MAP = {
  cots: "Draw Frame Cots Data Entry",
  uqc: "U% Data Entry",
  "wheel-change": "Wheel Change",
};

export function getStaticPaths() {
  return {
    paths: Object.keys(SCREEN_TYPE_MAP).map((screen) => ({
      params: { screen },
    })),
    fallback: false,
  };
}

export function getStaticProps({ params }) {
  const screen = String(params?.screen || "").trim().toLowerCase();
  const type = SCREEN_TYPE_MAP[screen];

  if (!type) {
    return { notFound: true };
  }

  return { props: { destination: `/draw-frame?type=${encodeURIComponent(type)}` } };
}

export default function DrawFrameAliasPage({ destination }) {
  const router = useRouter();

  useEffect(() => {
    router.replace(destination);
  }, [destination, router]);

  return null;
}
