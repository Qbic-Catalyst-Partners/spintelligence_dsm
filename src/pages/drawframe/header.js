export async function getServerSideProps() {
  return {
    redirect: {
      destination: "/draw-frame?type=PP%20-%20Breaker%20Drawing&scope=breaker",
      permanent: false,
    },
  };
}

export default function DrawFrameHeaderAliasPage() {
  return null;
}
