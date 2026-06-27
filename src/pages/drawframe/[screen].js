const SCREEN_TYPE_MAP = {
  header: "PP - Breaker Drawing",
  finisher: "PP - Finisher Drawing",
};

export async function getServerSideProps(context) {
  const screen = String(context?.params?.screen || "").trim().toLowerCase();
  const type = SCREEN_TYPE_MAP[screen];

  if (!type) {
    return {
      notFound: true,
    };
  }

  return {
    redirect: {
      destination: `/draw-frame?type=${encodeURIComponent(type)}`,
      permanent: false,
    },
  };
}

export default function DrawFrameAliasPage() {
  return null;
}
