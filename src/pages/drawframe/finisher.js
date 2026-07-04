export async function getServerSideProps() {
  return {
    redirect: {
      destination: "/draw-frame?type=PP%20-%20Finisher%20Drawing&scope=finisher",
      permanent: false,
    },
  };
}

export default function DrawFrameFinisherAliasPage() {
  return null;
}
