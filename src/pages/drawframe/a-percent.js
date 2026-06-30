export async function getServerSideProps() {
  return {
    redirect: {
      destination: "/draw-frame?type=A%25",
      permanent: false,
    },
  };
}

export default function DrawFrameAPercentAliasPage() {
  return null;
}
