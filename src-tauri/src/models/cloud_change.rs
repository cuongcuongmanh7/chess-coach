// Macro dùng chung cho các cặp kiểu remote/pending của một collection cloud.
// Đặt riêng ở module này và khai báo `#[macro_use]` trước các module models khác
// để mọi module models (cloud_content, cloud_repertoire, ...) đều dùng được.
macro_rules! cloud_change_types {
    ($remote:ident, $pending:ident, $data:ty) => {
        #[derive(Deserialize)]
        pub(crate) struct $remote {
            pub(crate) document_id: String,
            pub(crate) deleted: bool,
            pub(crate) data: Option<$data>,
        }

        #[derive(Serialize)]
        pub(crate) struct $pending {
            pub(crate) document_id: String,
            pub(crate) generation: i64,
            pub(crate) attempts: i64,
            pub(crate) deleted: bool,
            pub(crate) data: Option<$data>,
        }
    };
}
