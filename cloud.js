Moralis.Cloud.define("getUser", async (request) => {
      const adr = request.params.adr;
      const query = new Moralis.Query("_User")
      const pipeline = [
            {match: {$expr: {$eq: ["$ethAddress", adr]}}},
            {lookup: {
                  from: "Follows",
                  let: { id: "$_id"},
                  pipeline: [
                        {$match: { $expr: {$and: [
                              {$eq: ["$fldId", "$$id"]},
                              {$eq: ["$flrId", request.user.id]},
                        ]}}},
                  ],
                  as: "isFollowed",
            }},
            {lookup: {
                  from: "Follows",
                  let: {id: "$_id"},
                  pipeline: [
                        {$match: { $expr:
                              {$eq: ["$fldId", "$$id"]},
                        }},
                        {$count: "total"}
                  ],
                  as: "followers",
            }},
            {lookup: {
                  from: "Follows",
                  let: {id: "$_id"},
                  pipeline: [
                        {$match: { $expr:
                              {$eq: ["$flrId", "$$id"]},
                        }},
                        {$count: "total"}
                  ],
                  as: "followings",
            }},
            {lookup: {
                  from: "Posts",
                  let: {id: "$_id"},
                  pipeline: [
                        {$match: { $expr:
                              {$eq: ["$userId", "$$id"]},
                        }},
                        {$count: "total"}
                  ],
                  as: "postCount",
            }},
            {
                  addFields: {
                        "isFollowed": { $cond: [ { $eq: [ "$isFollowed", [] ] }, false, true ]}
                  }
            },
            {
                  addFields: {
                        "followers": {
                              $cond: [ { $eq: [ "$followers", [] ] }, 0, "$followers.total" ]
                        }
                  }
            },
            {
                  addFields: {
                        "followings": {
                              $cond: [ { $eq: [ "$followings", [] ] }, 0, "$followings.total" ]
                        }
                  }
            },
            {
                  addFields: {
                        "postCount": {
                              $cond: [ { $eq: [ "$postCount", [] ] }, 0, "$postCount.total" ]
                        }
                  }
            },
            {
                  addFields: {
                        "isMe": {
                              $cond: [ { $eq: [ "$_id", request.user.id ] }, true, false ]
                        }
                  }
            },
            {     unwind: {path: "$followers", preserveNullAndEmptyArrays: true}},
            {     unwind: {path: "$postCount", preserveNullAndEmptyArrays: true}},
            {     unwind: {path: "$followings", preserveNullAndEmptyArrays: true}},
            {
                  project: {
                        pfp: 1,
                        cover: 1,
                        username: 1,
                        ethAddress: 1,
                        bio: 1,
                        isFollowed: 1,
                        followers: "$followers",
                        followings: "$followings",
                        postCount: "$postCount",
                        isMe: "$isMe"
                  }
            },
            {     sort: {"followers": -1}}
      ]
      const result = query.aggregate(pipeline, {useMasterKey: true})
      return result
});

Moralis.Cloud.define("getUserId", async (request) => {
      const query = new Moralis.Query("_User")
      const adr = request.params.adr
      const pipeline = [
            {match: {$expr: {$eq: ["$ethAddress", adr]}}},
            {
                  addFields: {
                        "isMe": {
                              $cond: [ { $eq: [ "$_id", request.user.id ] }, true, false ]
                        }
                  }
            },
            {project: {
                  objectId: 1,
                  isMe: "$isMe",
            }}
      ]
      const result = query.aggregate(pipeline, {useMasterKey: true})
      return result
});

Moralis.Cloud.define("search", async (request) => {
      let searchText = request.params.text
      const query = new Moralis.Query("_User")
      query.notEqualTo("ethAddress", null)
      const pipeline = [
            {addFields: {
                  check: searchText
            }},
            {match: { "username": { "$regex": searchText, "$options": "i" } } },
            {match: {$expr: {$ne: ["$check", ""]}} },
            {project: {
                  pfp: 1,
                  username: 1,
                  ethAddress: 1
            }},
            {limit: 10}
      ]
      const result = query.aggregate(pipeline, {useMasterKey: true})
      return result
});

Moralis.Cloud.define("createPost", async (request) => {
      const desc = request.params.desc
      const ipfsHash = request.params.ipfsHash
      const Post = Moralis.Object.extend("Posts")
      const newPost = new Post();
      newPost.set("postDescription", desc)
      newPost.set("postImage", ipfsHash)
      newPost.set("userId", request.user.id)
      const save = await newPost.save(null, {useMasterKey: true})
      return save
});

const notificationSave = async (deliverBy, deliverTo, classId, type) =>{
      const Notif = Moralis.Object.extend("Notifications")
      const newNotif = new Notif();
      newNotif.set("classId", classId)
      newNotif.set("deliverBy", deliverBy)
      newNotif.set("deliverTo", deliverTo)
      newNotif.set("type", type)
      newNotif.save(null, {useMasterKey: true})

      const User = Moralis.Object.extend("_User")
      const user = new Moralis.Query(User)
      user.equalTo("objectId", deliverTo)
      const result = await user.first({useMasterKey: true})
      result.set("unReadNotif", result.attributes.unReadNotif + 1)
      result.save(null, {useMasterKey: true})
};

Moralis.Cloud.define("createComment", async (request) => {
      const postId = request.params.postId
      const comment = request.params.comment
      const Comment = Moralis.Object.extend("Comments")
      const newComment = new Comment();
      newComment.set("commenterId", request.user.id)
      newComment.set("postId", postId)
      newComment.set("comment", comment)
      const save = await newComment.save(null, {useMasterKey: true})

      const findPostUserQuery = new Moralis.Query("Posts")
      findPostUserQuery.equalTo("objectId", postId)
      const result = await findPostUserQuery.first({useMasterKey: true})

      if(result.attributes.userId !== request.user.id){
            notificationSave(request.user.id, result.attributes.userId, postId, 3)
      }

      return save
});

Moralis.Cloud.define("likePost", async (request) => {
      const postId = request.params.postId

      const LikesSearch = Moralis.Object.extend("Likes")
      const findPostLikerQuery = new Moralis.Query(LikesSearch)
      findPostLikerQuery.equalTo("postId", postId)
      findPostLikerQuery.equalTo("likerId", request.user.id)
      const object = await findPostLikerQuery.first({useMasterKey: true})
      //check if already liked
      if(object){
            await object.destroy({useMasterKey:true})
            return {status: "unliked"}
      }else{
            const Likes = Moralis.Object.extend("Likes")
            const newLike = new Likes();
            newLike.set("postId", postId)
            newLike.set("likerId", request.user.id)

            const findPostUserQuery = new Moralis.Query("Posts")
            findPostUserQuery.equalTo("objectId", postId)
            const result = await findPostUserQuery.first({useMasterKey: true})

            await newLike.save(null, {useMasterKey: true})
            if(result.attributes.userId !== request.user.id){
                  notificationSave(request.user.id, result.attributes.userId, postId, 2)
            }
            return {status: "liked"}
      }
});

Moralis.Cloud.define("deletePost", async (request) => {
      const postId = request.params.postId

      const searchPost = Moralis.Object.extend("Posts")
      const findPostUser = new Moralis.Query(searchPost)
      findPostUser.equalTo("objectId", postId)
      const object = await findPostUser.first({useMasterKey: true})
      //check if this is your post
      if(object.attributes.userId === request.user.id){
            await object.destroy({useMasterKey:true})
            //delete comment in this post
            let commentsToDelete = [{filter: {"postId" : postId}}]
            Moralis.bulkDeleteMany("Comments", commentsToDelete)
            //delete comment in this post
            let likesToDelete = [{filter: {"postId" : postId}}]
            Moralis.bulkDeleteMany("Likes", likesToDelete)

            return {status: "deleted"}
      }else{
            throw {error: "not your post"}
      }
});

Moralis.Cloud.define("followUser", async (request) => {
      const userId = request.params.userId

      const LikesSearch = Moralis.Object.extend("Follows")
      const findUserFollowQuery = new Moralis.Query(LikesSearch)
      findUserFollowQuery.equalTo("fldId", userId)
      findUserFollowQuery.equalTo("flrId", request.user.id)
      const object = await findUserFollowQuery.first({useMasterKey: true})
      //check if already follow
      if(object){
            await object.destroy({useMasterKey:true})
            return {status: "unFollowed"}
      }else{
            if(userId !== request.user.id){
                  const Follow = Moralis.Object.extend("Follows")
                  const newFollow = new Follow();
                  newFollow.set("fldId", userId);
                  newFollow.set("flrId", request.user.id);
                  notificationSave(request.user.id, userId, request.user.id, 1)
                  await newFollow.save(null, {useMasterKey: true});
                  return {status: "followed"}
            }else{
                  throw {error: "you can't like your own account"}
            }
      }
});

Moralis.Cloud.define("addToFavorites", async (request) => {
      const postId = request.params.postId

      const favoritesSearch = Moralis.Object.extend("Favorites")
      const findUserFavoritesQuery = new Moralis.Query(favoritesSearch)
      findUserFavoritesQuery.equalTo("postId", postId)
      findUserFavoritesQuery.equalTo("userId", request.user.id)
      const object = await findUserFavoritesQuery.first({useMasterKey: true})
      //check if already follow
      if(object){
            await object.destroy({useMasterKey:true})
            return {status: "unsave_favorites"}
      }else{
            const findPostUserQuery = new Moralis.Query("Posts")
            findPostUserQuery.equalTo("objectId", postId)
            const result = await findPostUserQuery.first({useMasterKey: true})

            if(result.attributes.userId !== request.user.id){
                  const Favorite = Moralis.Object.extend("Favorites")
                  const newFavorite = new Favorite();
                  newFavorite.set("postId", postId);
                  newFavorite.set("userId", request.user.id);
                  await newFavorite.save(null, {useMasterKey: true});
                  return {status: "saved_to_favorites"}
            }else{
                  throw {error: "this is your post, only non-post owner user can add this to favorites"}
            }
      }
});

Moralis.Cloud.define("userNotifNumber", async (request) => {
      const query = new Moralis.Query("_User")
      query.equalTo("objectId", request.user.id)
      query.select("unReadNotif")
      const result = query.first({useMasterKey: true})
      return result;
});

Moralis.Cloud.define("clearNotifNumber", async (request) => {
      const User = Moralis.Object.extend("_User")
      const user = new Moralis.Query(User)
      user.equalTo("objectId", request.user.id)
      const result = await user.first({useMasterKey: true})
      result.set("unReadNotif", 0)
      result.save(null, {useMasterKey: true})
      return 0
});

Moralis.Cloud.define("getUsers", async (request) => {
      const page = request.params.page
      const limit = 10
      const skipData = limit * page
      const users = new Moralis.Query("_User")
      users.notEqualTo("ethAddress", null)
      const pipeline = [
            {lookup: {
                  from: "Follows",
                  let: { id: "$_id"},
                  pipeline: [
                        {$match: { $expr: {$and: [
                              {$eq: ["$fldId", "$$id"]},
                              {$eq: ["$flrId", request.user.id]},
                        ]}}},
                  ],
                  as: "isFollowed",
            }},
            {lookup: {
                  from: "Follows",
                  let: {id: "$_id"},
                  pipeline: [
                        {$match: { $expr:
                              {$eq: ["$fldId", "$$id"]},
                        }},
                        {$count: "total"}
                  ],
                  as: "followers",
            }},
            {
                  addFields: {
                        "isFollowed": {
                              $cond: [ { $eq: [ "$isFollowed", [] ] }, false, true ]
                        }
                  }
            },
            {
                  addFields: {
                        "followers": {
                              $cond: [ { $eq: [ "$followers", [] ] }, 0, "$followers.total" ]
                        }
                  }
            },
            {
                  addFields: {
                        "isMe": {
                              $cond: [ { $eq: [ "$_id", request.user.id ] }, true, false ]
                        }
                  }
            },
            { unwind: {path: "$followers", preserveNullAndEmptyArrays: true}},
            {
                  project: {
                        pfp: 1,
                        username: 1,
                        ethAddress: 1,
                        isFollowed: 1,
                        followers: "$followers",
                        isMe: "$isMe"
                  }
            },
            {sort: {"isFollowed": 1, "isMe": 1}},
            {skip: skipData},
            {limit: limit},
      ]
      const result = await users.aggregate(pipeline, {useMasterKey: true})
      return result
});

Moralis.Cloud.define("followedUsers", async (request) => {
      const page = request.params.page
      const userId = request.params.userId
      const limit = 10
      const skipData = limit * page
      const users = new Moralis.Query("_User")
      users.notEqualTo("ethAddress", null)
      const pipeline = [
            {lookup: {
                  from: "Follows",
                  let: { id: "$_id"},
                  pipeline: [
                        {$match: { $expr: {$and: [
                              {$eq: ["$fldId", userId]},
                              {$eq: ["$flrId", "$$id"]},
                        ]}}},
                  ],
                  as: "show",
            }},
            {lookup: {
                  from: "Follows",
                  let: { id: "$_id"},
                  pipeline: [
                        {$match: { $expr: {$and: [
                              {$eq: ["$fldId", "$$id"]},
                              {$eq: ["$flrId", request.user.id]},
                        ]}}},
                  ],
                  as: "isFollowed",
            }},
            {lookup: {
                  from: "Follows",
                  let: {id: "$_id"},
                  pipeline: [
                        {$match: { $expr:
                              {$eq: ["$fldId", "$$id"]},
                        }},
                        {$count: "total"}
                  ],
                  as: "followers",
            }},
            {
                  addFields: {
                        "checkFollowed": {$first: "$show"}
                  }
            },
            {
                  addFields: {
                        "timeFollowed": "$checkFollowed._created_at"
                  }
            },
            {
                  addFields: {
                        "show": {
                              $cond: [ { $eq: [ "$show", [] ] }, false, true ]
                        }
                  }
            },
            {
                  addFields: {
                        "isFollowed": {
                              $cond: [ { $eq: [ "$isFollowed", [] ] }, false, true ]
                        }
                  }
            },
            {
                  addFields: {
                        "followers": {
                              $cond: [ { $eq: [ "$followers", [] ] }, 0, "$followers.total" ]
                        }
                  }
            },
            {
                  addFields: {
                        "isMe": {
                              $cond: [ { $eq: [ "$_id", request.user.id ] }, true, false ]
                        }
                  }
            },
            { unwind: {path: "$followers", preserveNullAndEmptyArrays: true}},
            {
                  project: {
                        pfp: 1,
                        username: 1,
                        ethAddress: 1,
                        show: 1,
                        isFollowed: 1,
                        followers: 1,
                        isMe: 1,
                        timeFollowed: 1
                  }
            },
            {match: {$expr: {$eq: ["$show", true]}}},
            {sort: {"timeFollowed": -1}},
            {skip: skipData},
            {limit: limit},
      ]
      const result = await users.aggregate(pipeline, {useMasterKey: true})
      return result
});

Moralis.Cloud.define("followingUsers", async (request) => {
      const page = request.params.page
      const userId = request.params.userId
      const limit = 10
      const skipData = limit * page
      const users = new Moralis.Query("_User")
      users.notEqualTo("ethAddress", null)
      const pipeline = [
            {lookup: {
                  from: "Follows",
                  let: { id: "$_id"},
                  pipeline: [
                        {$match: { $expr: {$and: [
                              {$eq: ["$fldId", "$$id"]},
                              {$eq: ["$flrId", userId]},
                        ]}}},
                  ],
                  as: "show",
            }},
            {lookup: {
                  from: "Follows",
                  let: { id: "$_id"},
                  pipeline: [
                        {$match: { $expr: {$and: [
                              {$eq: ["$fldId", "$$id"]},
                              {$eq: ["$flrId", request.user.id]},
                        ]}}},
                  ],
                  as: "isFollowed",
            }},
            {lookup: {
                  from: "Follows",
                  let: {id: "$_id"},
                  pipeline: [
                        {$match: { $expr:
                              {$eq: ["$fldId", "$$id"]},
                        }},
                        {$count: "total"}
                  ],
                  as: "followers",
            }},
            {
                  addFields: {
                        "checkFollowing": {$first: "$show"}
                  }
            },
            {
                  addFields: {
                        "timeFollowed": "$checkFollowing._created_at"
                  }
            },
            {
                  addFields: {
                        "show": {
                              $cond: [ { $eq: [ "$show", [] ] }, false, true ]
                        }
                  }
            },
            {
                  addFields: {
                        "isFollowed": {
                              $cond: [ { $eq: [ "$isFollowed", [] ] }, false, true ]
                        }
                  }
            },
            {
                  addFields: {
                        "followers": {
                              $cond: [ { $eq: [ "$followers", [] ] }, 0, "$followers.total" ]
                        }
                  }
            },
            {
                  addFields: {
                        "isMe": {
                              $cond: [ { $eq: [ "$_id", request.user.id ] }, true, false ]
                        }
                  }
            },
            { unwind: {path: "$followers", preserveNullAndEmptyArrays: true}},
            {
                  project: {
                        pfp: 1,
                        username: 1,
                        ethAddress: 1,
                        show: 1,
                        isFollowed: 1,
                        followers: 1,
                        isMe: 1,
                        timeFollowed: 1
                  }
            },
            {match: {$expr: {$eq: ["$show", true]}}},
            {sort: {"timeFollowed": -1}},
            {skip: skipData},
            {limit: limit},
      ]
      const result = await users.aggregate(pipeline, {useMasterKey: true})
      return result
});

Moralis.Cloud.define("getRecomUser", async (request) => {
      const users = new Moralis.Query("_User")
      users.notEqualTo("ethAddress", null)
      const pipeline = [
            {lookup: {
                  from: "Follows",
                  let: { id: "$_id"},
                  pipeline: [
                        {$match: { $expr: {$and: [
                              {$eq: ["$fldId", "$$id"]},
                              {$eq: ["$flrId", request.user.id]},
                        ]}}},
                  ],
                  as: "isFollowed",
            }},
            {lookup: {
                  from: "Follows",
                  let: {id: "$_id"},
                  pipeline: [
                        {$match: { $expr:
                              {$eq: ["$fldId", "$$id"]},
                        }},
                        {$count: "total"}
                  ],
                  as: "followers",
            }},
            {
                  addFields: {
                        "isFollowed": {
                              $cond: [ { $eq: [ "$isFollowed", [] ] }, false, true ]
                        }
                  }
            },
            {
                  addFields: {
                        "followers": {
                              $cond: [ { $eq: [ "$followers", [] ] }, 0, "$followers.total" ]
                        }
                  }
            },
            {
                  addFields: {
                        "isMe": {
                              $cond: [ { $eq: [ "$_id", request.user.id ] }, true, false ]
                        }
                  }
            },
            { unwind: {path: "$followers", preserveNullAndEmptyArrays: true}},
            {
                  project: {
                        pfp: 1,
                        username: 1,
                        ethAddress: 1,
                        isFollowed: 1,
                        followers: "$followers",
                        isMe: "$isMe"
                  }
            },
            {match: {$expr: {$and: [
                  {$eq: ["$isFollowed", false]},
                  {$eq: ["$isMe", false]},
            ]}}},
            {sort: {"followers": -1}},
            {limit: 3}
      ]
      const result = await users.aggregate(pipeline, {useMasterKey: true})
      return result
});

Moralis.Cloud.define("getNotif", async (request) => {
      const limit = 8
      const page = request.params.page
      const skipData = limit * page
      const query = new Moralis.Query("Notifications")
      query.equalTo("deliverTo", request.user.id)
      const pipeline = [
            {lookup: {
                  from: "_User",
                  let: {id: "$deliverBy"},
                  pipeline: [
                        {$match: {$expr: {$eq: ["$_id", "$$id"]}}}
                  ],
                  as: "userData"
            }},
            {group: {
                  "objectId": {type: "$type", deliverTo: "$deliverTo", classId: "$classId", deliverBy: "$deliverBy"},
                  username: {$first: "$userData.username"},
                  pfp: {$first: "$userData.pfp"},
                  ethAddress: {$first: "$userData.ethAddress"},
                  type: {$first: "$type"},
                  classId: {$first: "$classId"},
                  viewed: {$first: "$viewed"}
            }},
            {sort: {"_created_at": -1}},
            {skip: skipData},
            {limit: limit}
      ]
      const result = query.aggregate(pipeline, {useMasterKey: true})
      return result
});

Moralis.Cloud.define("postComments", async (request) => {
      const postId = request.params.postId
      const page = request.params.page
      const limit = 8
      const skipData = page * limit
      const query = new Moralis.Query("Comments")
      query.equalTo("postId", postId)

      const pipeline = [
            {
                  lookup: {
                        from: "_User",
                        let: { id: "$commenterId"},
                        pipeline: [
                              {$match: {$expr: {$eq: ["$_id", "$$id"]}}},
                              {$project: {
                                    pfp: 1,
                                    username: 1,
                                    ethAddress: 1
                              }}
                        ],
                        as: "commenterData"
                  }
            },
            { unwind: {path: "$commenterData", preserveNullAndEmptyArrays: true}},
            { sort: {"_created_at": -1}},
            {skip: skipData},
            {limit: limit},
      ]

      const result = query.aggregate(pipeline, {useMasterKey: true})
      return result
});

Moralis.Cloud.define("getSinglePost", async (request) => {
      const postId = request.params.postId
      const query = new Moralis.Query("Posts")
      query.equalTo("objectId", postId)

      const pipeline = [
            {lookup: {
                  from: "Comments",
                  let: { id: "$_id"},
                  pipeline: [
                        {$match: { $expr: { $eq: ["$postId", "$$id"]}}},
                        {$facet: { 
                              total: [{$count: "total"}],
                              isMore: [
                                    {$lookup: {
                                          from: "_User",
                                          let: { ownerId: "$commenterId"},
                                          pipeline: [
                                                {$match: { $expr: { $eq: ["$_id", "$$ownerId"]}}},
                                                {$project: { username: 1, ethAddress: 1}}
                                          ],
                                          as: "commenterData",
                                    }},
                                    {$lookup: {
                                          from: "Follows",
                                          let: { ownerId: "$commenterId"},
                                          pipeline: [
                                                {$match: { $expr: {$and: [
                                                      {$eq: ["$fldId", "$$ownerId"]},
                                                      {$eq: ["$flrId", request.user.id]},
                                                ]}}},
                                          ],
                                          as: "isFollowed",
                                    }},
                                    {$unwind: {path: "$commenterData", preserveNullAndEmptyArrays: true}},
                                    {
                                          $addFields: {
                                                "isFollowed": {
                                                      $cond: [ { $eq: [ "$isFollowed", [] ] }, false, true ]
                                                }
                                          }
                                    },
                                    {
                                          $addFields: {
                                                "isMe": {
                                                      $cond: [ { $eq: [ "$commenterData._id", request.user.id ] }, true, false ]
                                                }
                                          }
                                    },
                                    {$match: {$expr: {$or: [
                                          {$eq: ["$isFollowed", true]},
                                          {$eq: ["$isMe", true]}
                                    ]}}},
                                    {
                                          $group :
                                          {
                                                _id : "$commenterId",
                                                isFollowed: {$first: "$isFollowed"},
                                                comment: {$first: "$comment"},
                                                commenterData: {$first: "$commenterData"}, 
                                                isMe: {$first: "$isMe"}
                                          }
                                    },
                                    {$count: "total"}
                              ],
                              lazy_data: [
                                    {$lookup: {
                                          from: "_User",
                                          let: { ownerId: "$commenterId"},
                                          pipeline: [
                                                {$match: { $expr: { $eq: ["$_id", "$$ownerId"]}}},
                                                {$project: { username: 1, ethAddress: 1}}
                                          ],
                                          as: "commenterData",
                                    }},
                                    {$lookup: {
                                          from: "Follows",
                                          let: { ownerId: "$commenterId"},
                                          pipeline: [
                                                {$match: { $expr: {$and: [
                                                      {$eq: ["$fldId", "$$ownerId"]},
                                                      {$eq: ["$flrId", request.user.id]},
                                                ]}}},
                                          ],
                                          as: "isFollowed",
                                    }},
                                    {$unwind: {path: "$commenterData", preserveNullAndEmptyArrays: true}},
                                    {
                                          $addFields: {
                                                "isFollowed": {
                                                      $cond: [ { $eq: [ "$isFollowed", [] ] }, false, true ]
                                                }
                                          }
                                    },
                                    {
                                          $addFields: {
                                                "isMe": {
                                                      $cond: [ { $eq: [ "$commenterData._id", request.user.id ] }, true, false ]
                                                }
                                          }
                                    },
                                    {$match: {$expr: {$or: [
                                          {$eq: ["$isFollowed", true]},
                                          {$eq: ["$isMe", true]}
                                    ]}}},
                                    {
                                          $group :
                                          {
                                                _id : "$commenterId",
                                                isFollowed: {$first: "$isFollowed"},
                                                comment: {$first: "$comment"},
                                                commenterData: {$first: "$commenterData"}, 
                                                isMe: {$first: "$isMe"}
                                          }
                                    },
                                    {$sort: {"isMe": -1}},
                                    {$limit: 3}
                              ]
                        }},
                        {
                              $addFields: {
                                    "total": {
                                          $cond: [ { $eq: [ "$total", [] ] }, 0, "$total.total" ]
                                    }
                              }
                        },
                        {$unwind: {path: "$isMore", preserveNullAndEmptyArrays: true}},
                        {
                              $addFields: {
                                    "isMore": {
                                          $cond: [ {$gte: [ "$isMore.total", 4 ]}, true, false]
                                    }
                              }
                        },
                        {$unwind: {path: "$total", preserveNullAndEmptyArrays: true}},
                  ],
                  as: "comments",
            }},
            {lookup: {
                  from: "Likes",
                  let: {postId: "$_id"},
                  pipeline: [
                        {$match: { $expr: 
                              { $eq: ["$postId", "$$postId"]},
                        }},
                        {$facet: {
                              total: [
                                    {$count: "total"}
                              ],
                              isMore: [
                                    {$lookup: {
                                          from: "_User",
                                          let: { ownerId: "$likerId"},
                                          pipeline: [
                                                {$match: { $expr: { $eq: ["$_id", "$$ownerId"]}}},
                                                {$project: { username: 1, ethAddress: 1}}
                                          ],
                                          as: "likerData",
                                    }},
                                    {$lookup: {
                                          from: "Follows",
                                          let: { ownerId: "$likerId"},
                                          pipeline: [
                                                {$match: { $expr: {$and: [
                                                      {$eq: ["$fldId", "$$ownerId"]},
                                                      {$eq: ["$flrId", request.user.id]},
                                                ]}}},
                                          ],
                                          as: "isFollowed",
                                    }},
                                    {$unwind: {path: "$likerData", preserveNullAndEmptyArrays: true}},
                                    {
                                          $addFields: {
                                                "isFollowed": {
                                                      $cond: [ { $eq: [ "$isFollowed", [] ] }, false, true ]
                                                }
                                          }
                                    },
                                    {
                                          $addFields: {
                                                "isMe": {
                                                      $cond: [ { $eq: [ "$likerData._id", request.user.id ] }, true, false ]
                                                }
                                          }
                                    },
                                    {$match: {$expr: {$or: [
                                          {$eq: ["$isFollowed", true]},
                                          {$eq: ["$isMe", true]}
                                    ]}}},
                                    {$sort: {"isMe": -1}},
                                    {$count: "total"}
                              ],
                              lazy_data: [
                                    {$lookup: {
                                          from: "_User",
                                          let: { ownerId: "$likerId"},
                                          pipeline: [
                                                {$match: { $expr: { $eq: ["$_id", "$$ownerId"]}}},
                                                {$project: { username: 1, ethAddress: 1}}
                                          ],
                                          as: "likerData",
                                    }},
                                    {$lookup: {
                                          from: "Follows",
                                          let: { ownerId: "$likerId"},
                                          pipeline: [
                                                {$match: { $expr: {$and: [
                                                      {$eq: ["$fldId", "$$ownerId"]},
                                                      {$eq: ["$flrId", request.user.id]},
                                                ]}}},
                                          ],
                                          as: "isFollowed",
                                    }},
                                    {$unwind: {path: "$likerData", preserveNullAndEmptyArrays: true}},
                                    {
                                          $addFields: {
                                                "isFollowed": {
                                                      $cond: [ { $eq: [ "$isFollowed", [] ] }, false, true ]
                                                }
                                          }
                                    },
                                    {
                                          $addFields: {
                                                "isMe": {
                                                      $cond: [ { $eq: [ "$likerData._id", request.user.id ] }, true, false ]
                                                }
                                          }
                                    },
                                    {$match: {$expr: {$or: [
                                          {$eq: ["$isFollowed", true]},
                                          {$eq: ["$isMe", true]}
                                    ]}}},
                                    {$sort: {"isMe": -1}},
                                    {$limit: 3}
                              ],
                        }},
                        {
                              $addFields: {
                                    "total": {
                                          $cond: [ { $eq: [ "$total", [] ] }, 0, "$total.total" ]
                                    }
                              }
                        },
                        {$unwind: {path: "$total", preserveNullAndEmptyArrays: true}},
                        {$unwind: {path: "$isMore", preserveNullAndEmptyArrays: true}},
                        {
                              $addFields: {
                                    "isMore": {
                                          $cond: [ {$gte: [ "$isMore.total", 4 ]}, true, false]
                                    }
                              }
                        },
                  ],
                  as: "likes",
            }},
            {lookup: {
                  from: "_User",
                  let: { ownerId: "$userId"},
                  pipeline: [
                        {$match: { $expr: { $eq: ["$_id", "$$ownerId"]}}},
                        {$project: { username: 1, ethAddress: 1, pfp: 1}}
                  ],
                  as: "ownerData",
            }},
            {lookup: {
                  from: "Likes",
                  let: {postId: "$_id"},
                  pipeline: [
                        {$match: { $expr: {$and: [
                              { $eq: ["$likerId", request.user.id]},
                              { $eq: ["$postId", "$$postId"]},
                        ]}}},
                  ],
                  as: "likedByMe",
            }},
            {lookup: {
                  from: "Favorites",
                  let: { id: "$_id"},
                  pipeline: [
                        {$match: { $expr: {$and: [
                              { $eq: ["$postId", "$$id"]},
                              { $eq: ["$userId", request.user.id]},
                        ]}}},
                  ],
                  as: "addedToFavorites",
            }},
            {
                  addFields: {
                        "addedToFavorites": {
                              $cond: [ { $eq: [ "$addedToFavorites", [] ] }, false, true ]
                        }
                  }
            },
            {
                  addFields: {
                        "likedByMe": {
                              $cond: [ { $eq: [ "$likedByMe", [] ] }, false, true ]
                        }
                  }
            },
            {
                  addFields: {
                        "isMyPost": {
                              $cond: [ { $eq: [ "$userId", request.user.id ] }, true, false ]
                        }
                  }
            },
            {unwind: {path: "$comments", preserveNullAndEmptyArrays: true}},
            {unwind: {path: "$likes", preserveNullAndEmptyArrays: true}},
            {unwind: {path: "$ownerData", preserveNullAndEmptyArrays: true}},
      ];
      return query.aggregate(pipeline, {useMasterKey: true});
});

Moralis.Cloud.define("feedPosts", async (request) => {
      const limit = 6
      const page = request.params.page
      const skipData = (limit * page)

      const query = new Moralis.Query("Posts")
      const pipeline = [
            {lookup: {
                  from: "Comments",
                  let: { id: "$_id"},
                  pipeline: [
                        {$match: { $expr: { $eq: ["$postId", "$$id"]}}},
                        {$facet: { 
                              total: [{$count: "total"}],
                              isMore: [
                                    {$lookup: {
                                          from: "_User",
                                          let: { ownerId: "$commenterId"},
                                          pipeline: [
                                                {$match: { $expr: { $eq: ["$_id", "$$ownerId"]}}},
                                                {$project: { username: 1, ethAddress: 1}}
                                          ],
                                          as: "commenterData",
                                    }},
                                    {$lookup: {
                                          from: "Follows",
                                          let: { ownerId: "$commenterId"},
                                          pipeline: [
                                                {$match: { $expr: {$and: [
                                                      {$eq: ["$fldId", "$$ownerId"]},
                                                      {$eq: ["$flrId", request.user.id]},
                                                ]}}},
                                          ],
                                          as: "isFollowed",
                                    }},
                                    {$unwind: {path: "$commenterData", preserveNullAndEmptyArrays: true}},
                                    {
                                          $addFields: {
                                                "isFollowed": {
                                                      $cond: [ { $eq: [ "$isFollowed", [] ] }, false, true ]
                                                }
                                          }
                                    },
                                    {
                                          $addFields: {
                                                "isMe": {
                                                      $cond: [ { $eq: [ "$commenterData._id", request.user.id ] }, true, false ]
                                                }
                                          }
                                    },
                                    {$match: {$expr: {$or: [
                                          {$eq: ["$isFollowed", true]},
                                          {$eq: ["$isMe", true]}
                                    ]}}},
                                    {
                                          $group :
                                          {
                                                _id : "$commenterId",
                                                isFollowed: {$first: "$isFollowed"},
                                                comment: {$first: "$comment"},
                                                commenterData: {$first: "$commenterData"}, 
                                                isMe: {$first: "$isMe"}
                                          }
                                    },
                                    {$count: "total"}
                              ],
                              lazy_data: [
                                    {$lookup: {
                                          from: "_User",
                                          let: { ownerId: "$commenterId"},
                                          pipeline: [
                                                {$match: { $expr: { $eq: ["$_id", "$$ownerId"]}}},
                                                {$project: { username: 1, ethAddress: 1}}
                                          ],
                                          as: "commenterData",
                                    }},
                                    {$lookup: {
                                          from: "Follows",
                                          let: { ownerId: "$commenterId"},
                                          pipeline: [
                                                {$match: { $expr: {$and: [
                                                      {$eq: ["$fldId", "$$ownerId"]},
                                                      {$eq: ["$flrId", request.user.id]},
                                                ]}}},
                                          ],
                                          as: "isFollowed",
                                    }},
                                    {$unwind: {path: "$commenterData", preserveNullAndEmptyArrays: true}},
                                    {
                                          $addFields: {
                                                "isFollowed": {
                                                      $cond: [ { $eq: [ "$isFollowed", [] ] }, false, true ]
                                                }
                                          }
                                    },
                                    {
                                          $addFields: {
                                                "isMe": {
                                                      $cond: [ { $eq: [ "$commenterData._id", request.user.id ] }, true, false ]
                                                }
                                          }
                                    },
                                    {$match: {$expr: {$or: [
                                          {$eq: ["$isFollowed", true]},
                                          {$eq: ["$isMe", true]}
                                    ]}}},
                                    {
                                          $group :
                                          {
                                                _id : "$commenterId",
                                                isFollowed: {$first: "$isFollowed"},
                                                comment: {$first: "$comment"},
                                                commenterData: {$first: "$commenterData"}, 
                                                isMe: {$first: "$isMe"}
                                          }
                                    },
                                    {$sort: {"isMe": -1}},
                                    {$limit: 3}
                              ]
                        }},
                        {
                              $addFields: {
                                    "total": {
                                          $cond: [ { $eq: [ "$total", [] ] }, 0, "$total.total" ]
                                    }
                              }
                        },
                        {$unwind: {path: "$isMore", preserveNullAndEmptyArrays: true}},
                        {
                              $addFields: {
                                    "isMore": {
                                          $cond: [ {$gte: [ "$isMore.total", 4 ]}, true, false]
                                    }
                              }
                        },
                        {$unwind: {path: "$total", preserveNullAndEmptyArrays: true}},
                  ],
                  as: "comments",
            }},
            {lookup: {
                  from: "Likes",
                  let: {postId: "$_id"},
                  pipeline: [
                        {$match: { $expr: 
                              { $eq: ["$postId", "$$postId"]},
                        }},
                        {$facet: {
                              total: [
                                    {$count: "total"}
                              ],
                              isMore: [
                                    {$lookup: {
                                          from: "_User",
                                          let: { ownerId: "$likerId"},
                                          pipeline: [
                                                {$match: { $expr: { $eq: ["$_id", "$$ownerId"]}}},
                                                {$project: { username: 1, ethAddress: 1}}
                                          ],
                                          as: "likerData",
                                    }},
                                    {$lookup: {
                                          from: "Follows",
                                          let: { ownerId: "$likerId"},
                                          pipeline: [
                                                {$match: { $expr: {$and: [
                                                      {$eq: ["$fldId", "$$ownerId"]},
                                                      {$eq: ["$flrId", request.user.id]},
                                                ]}}},
                                          ],
                                          as: "isFollowed",
                                    }},
                                    {$unwind: {path: "$likerData", preserveNullAndEmptyArrays: true}},
                                    {
                                          $addFields: {
                                                "isFollowed": {
                                                      $cond: [ { $eq: [ "$isFollowed", [] ] }, false, true ]
                                                }
                                          }
                                    },
                                    {
                                          $addFields: {
                                                "isMe": {
                                                      $cond: [ { $eq: [ "$likerData._id", request.user.id ] }, true, false ]
                                                }
                                          }
                                    },
                                    {$match: {$expr: {$or: [
                                          {$eq: ["$isFollowed", true]},
                                          {$eq: ["$isMe", true]}
                                    ]}}},
                                    {$sort: {"isMe": -1}},
                                    {$count: "total"}
                              ],
                              lazy_data: [
                                    {$lookup: {
                                          from: "_User",
                                          let: { ownerId: "$likerId"},
                                          pipeline: [
                                                {$match: { $expr: { $eq: ["$_id", "$$ownerId"]}}},
                                                {$project: { username: 1, ethAddress: 1}}
                                          ],
                                          as: "likerData",
                                    }},
                                    {$lookup: {
                                          from: "Follows",
                                          let: { ownerId: "$likerId"},
                                          pipeline: [
                                                {$match: { $expr: {$and: [
                                                      {$eq: ["$fldId", "$$ownerId"]},
                                                      {$eq: ["$flrId", request.user.id]},
                                                ]}}},
                                          ],
                                          as: "isFollowed",
                                    }},
                                    {$unwind: {path: "$likerData", preserveNullAndEmptyArrays: true}},
                                    {
                                          $addFields: {
                                                "isFollowed": {
                                                      $cond: [ { $eq: [ "$isFollowed", [] ] }, false, true ]
                                                }
                                          }
                                    },
                                    {
                                          $addFields: {
                                                "isMe": {
                                                      $cond: [ { $eq: [ "$likerData._id", request.user.id ] }, true, false ]
                                                }
                                          }
                                    },
                                    {$match: {$expr: {$or: [
                                          {$eq: ["$isFollowed", true]},
                                          {$eq: ["$isMe", true]}
                                    ]}}},
                                    {$sort: {"isMe": -1}},
                                    {$limit: 3}
                              ],
                        }},
                        {
                              $addFields: {
                                    "total": {
                                          $cond: [ { $eq: [ "$total", [] ] }, 0, "$total.total" ]
                                    }
                              }
                        },
                        {$unwind: {path: "$total", preserveNullAndEmptyArrays: true}},
                        {$unwind: {path: "$isMore", preserveNullAndEmptyArrays: true}},
                        {
                              $addFields: {
                                    "isMore": {
                                          $cond: [ {$gte: [ "$isMore.total", 4 ]}, true, false]
                                    }
                              }
                        },
                  ],
                  as: "likes",
            }},
            {lookup: {
                  from: "Favorites",
                  let: { id: "$_id"},
                  pipeline: [
                        {$match: { $expr: {$and: [
                              { $eq: ["$postId", "$$id"]},
                              { $eq: ["$userId", request.user.id]},
                        ]}}},
                  ],
                  as: "addedToFavorites",
            }},
            {lookup: {
                  from: "_User",
                  let: { ownerId: "$userId"},
                  pipeline: [
                        {$match: { $expr: { $eq: ["$_id", "$$ownerId"]}}},
                        {$project: { username: 1, ethAddress: 1, pfp: 1}}
                  ],
                  as: "ownerData",
            }},
            {lookup: {
                  from: "Likes",
                  let: {postId: "$_id"},
                  pipeline: [
                        {$match: { $expr: {$and: [
                              { $eq: ["$likerId", request.user.id]},
                              { $eq: ["$postId", "$$postId"]},
                        ]}}},
                  ],
                  as: "likedByMe",
            }},
            {
                  addFields: {
                        "addedToFavorites": {
                              $cond: [ { $eq: [ "$addedToFavorites", [] ] }, false, true ]
                        }
                  }
            },
            {
                  addFields: {
                        "likedByMe": {
                              $cond: [ { $eq: [ "$likedByMe", [] ] }, false, true ]
                        }
                  }
            },
            {
                  addFields: {
                        "isMyPost": {
                              $cond: [ { $eq: [ "$userId", request.user.id ] }, true, false ]
                        }
                  }
            },
            {unwind: {path: "$comments", preserveNullAndEmptyArrays: true}},
            {unwind: {path: "$likes", preserveNullAndEmptyArrays: true}},
            {unwind: {path: "$ownerData", preserveNullAndEmptyArrays: true}},
            {sort: {"_created_at": -1}},
            {skip: skipData},
            {limit: limit}
      ];
      return query.aggregate(pipeline, {useMasterKey: true});
});

Moralis.Cloud.define("userPosts", async (request) => {
      const limit = 6
      const page = request.params.page
      const skipData = (limit * page)
      const userId = request.params.userId

      const query = new Moralis.Query("Posts")
      const pipeline = [
            {match: {$expr: {$eq: ["$userId", userId]}}},
            {lookup: {
                  from: "Comments",
                  let: { id: "$_id"},
                  pipeline: [
                        {$match: { $expr: { $eq: ["$postId", "$$id"]}}},
                        {$facet: { 
                              total: [{$count: "total"}],
                              lazy_data: [
                                    {$lookup: {
                                          from: "_User",
                                          let: { ownerId: "$commenterId"},
                                          pipeline: [
                                                {$match: { $expr: { $eq: ["$_id", "$$ownerId"]}}},
                                                {$project: { username: 1, ethAddress: 1}}
                                          ],
                                          as: "commenterData",
                                    }},
                                    {$lookup: {
                                          from: "Follows",
                                          let: { ownerId: "$commenterId"},
                                          pipeline: [
                                                {$match: { $expr: {$and: [
                                                      {$eq: ["$fldId", "$$ownerId"]},
                                                      {$eq: ["$flrId", request.user.id]},
                                                ]}}},
                                          ],
                                          as: "isFollowed",
                                    }},
                                    {$unwind: {path: "$commenterData", preserveNullAndEmptyArrays: true}},
                                    {
                                          $addFields: {
                                                "isFollowed": {
                                                      $cond: [ { $eq: [ "$isFollowed", [] ] }, false, true ]
                                                }
                                          }
                                    },
                                    {$match: {$expr: {$eq: ["$isFollowed", true]}}},
                                    {
                                          $group :
                                          {
                                                _id : "$commenterId",
                                                isFollowed: {$first: "$isFollowed"},
                                                comment: {$first: "$comment"},
                                                commenterData: {$first: "$commenterData"}
                                          }
                                    },
                                    {$limit: 3}
                              ]
                        }},
                        {
                              $addFields: {
                                    "total": {
                                          $cond: [ { $eq: [ "$total", [] ] }, 0, "$total.total" ]
                                    }
                              }
                        },
                        {$unwind: {path: "$total", preserveNullAndEmptyArrays: true}},
                  ],
                  as: "comments",
            }},
            {lookup: {
                  from: "Likes",
                  let: {postId: "$_id"},
                  pipeline: [
                        {$match: { $expr: 
                              { $eq: ["$postId", "$$postId"]},
                        }},
                        {$facet: {
                              total: [
                                    {$count: "total"}
                              ],
                              lazy_data: [
                                    {$lookup: {
                                          from: "_User",
                                          let: { ownerId: "$likerId"},
                                          pipeline: [
                                                {$match: { $expr: { $eq: ["$_id", "$$ownerId"]}}},
                                                {$project: { username: 1, ethAddress: 1}}
                                          ],
                                          as: "likerData",
                                    }},
                                    {$lookup: {
                                          from: "Follows",
                                          let: { ownerId: "$likerId"},
                                          pipeline: [
                                                {$match: { $expr: {$and: [
                                                      {$eq: ["$fldId", "$$ownerId"]},
                                                      {$eq: ["$flrId", request.user.id]},
                                                ]}}},
                                          ],
                                          as: "isFollowed",
                                    }},
                                    {$unwind: {path: "$likerData", preserveNullAndEmptyArrays: true}},
                                    {
                                          $addFields: {
                                                "isFollowed": {
                                                      $cond: [ { $eq: [ "$isFollowed", [] ] }, false, true ]
                                                }
                                          }
                                    },
                                    {
                                          $addFields: {
                                                "isMe": {
                                                      $cond: [ { $eq: [ "$likerData._id", request.user.id ] }, true, false ]
                                                }
                                          }
                                    },
                                    {$match: {$expr: {$or: [
                                          {$eq: ["$isFollowed", true]},
                                          {$eq: ["$isMe", true]}
                                    ]}}},
                                    {$sort: {"isMe": -1}},
                                    {$limit: 3}
                              ],
                        }},
                        {
                              $addFields: {
                                    "total": {
                                          $cond: [ { $eq: [ "$total", [] ] }, 0, "$total.total" ]
                                    }
                              }
                        },
                        {$unwind: {path: "$total", preserveNullAndEmptyArrays: true}}
                  ],
                  as: "likes",
            }},
            {lookup: {
                  from: "_User",
                  let: { ownerId: "$userId"},
                  pipeline: [
                        {$match: { $expr: { $eq: ["$_id", "$$ownerId"]}}},
                        {$project: { username: 1, ethAddress: 1, pfp: 1}}
                  ],
                  as: "ownerData",
            }},
            {lookup: {
                  from: "Likes",
                  let: {postId: "$_id"},
                  pipeline: [
                        {$match: { $expr: {$and: [
                              { $eq: ["$likerId", request.user.id]},
                              { $eq: ["$postId", "$$postId"]},
                        ]}}},
                  ],
                  as: "likedByMe",
            }},
            {lookup: {
                  from: "Favorites",
                  let: { id: "$_id"},
                  pipeline: [
                        {$match: { $expr: {$and: [
                              { $eq: ["$postId", "$$id"]},
                              { $eq: ["$userId", request.user.id]},
                        ]}}},
                  ],
                  as: "addedToFavorites",
            }},
            {
                  addFields: {
                        "addedToFavorites": {
                              $cond: [ { $eq: [ "$addedToFavorites", [] ] }, false, true ]
                        }
                  }
            },
            {
                  addFields: {
                        "likedByMe": {
                              $cond: [ { $eq: [ "$likedByMe", [] ] }, false, true ]
                        }
                  }
            },
            {
                  addFields: {
                        "isMyPost": {
                              $cond: [ { $eq: [ "$userId", request.user.id ] }, true, false ]
                        }
                  }
            },
            {unwind: {path: "$likes", preserveNullAndEmptyArrays: true}},
            {unwind: {path: "$comments", preserveNullAndEmptyArrays: true}},
            {unwind: {path: "$ownerData", preserveNullAndEmptyArrays: true}},
            {sort: {"_created_at": -1}},
            {skip: skipData},
            {limit: limit}
      ];
      return query.aggregate(pipeline, {useMasterKey: true});
});

Moralis.Cloud.define("userFavoritePost", async (request) => {
      const limit = 6
      const page = request.params.page
      const skipData = (limit * page)

      const query = new Moralis.Query("Posts")
      const pipeline = [
            {
                  addFields: {
                        "isMyPost": {
                              $cond: [ { $eq: [ "$userId", request.user.id ] }, true, false ]
                        }
                  }
            },
            {lookup: {
                  from: "Favorites",
                  let: { id: "$_id"},
                  pipeline: [
                        {$match: { $expr: {$and: [
                              { $eq: ["$postId", "$$id"]},
                              { $eq: ["$userId", request.user.id]},
                        ]}}},
                  ],
                  as: "addedToFavorites",
            }},
            {
                  addFields: {
                        "checkFavorites": {$first: "$addedToFavorites"}
                  }
            },
            {
                  addFields: {
                        "timeAddedToFavorites": "$checkFavorites._created_at"
                  }
            },
            {
                  addFields: {
                        "addedToFavorites": {
                              $cond: [ { $eq: [ "$addedToFavorites", [] ] }, false, true ]
                        }
                  }
            },
            {match: {$expr: {$and: [
                  {$eq: ["$addedToFavorites", true]},
                  {$eq: ["$isMyPost", false]}
            ]}}},
            {lookup: {
                  from: "Comments",
                  let: { id: "$_id"},
                  pipeline: [
                        {$match: { $expr: { $eq: ["$postId", "$$id"]}}},
                        {$facet: { 
                              total: [{$count: "total"}],
                              lazy_data: [
                                    {$lookup: {
                                          from: "_User",
                                          let: { ownerId: "$commenterId"},
                                          pipeline: [
                                                {$match: { $expr: { $eq: ["$_id", "$$ownerId"]}}},
                                                {$project: { username: 1, ethAddress: 1}}
                                          ],
                                          as: "commenterData",
                                    }},
                                    {$lookup: {
                                          from: "Follows",
                                          let: { ownerId: "$commenterId"},
                                          pipeline: [
                                                {$match: { $expr: {$and: [
                                                      {$eq: ["$fldId", "$$ownerId"]},
                                                      {$eq: ["$flrId", request.user.id]},
                                                ]}}},
                                          ],
                                          as: "isFollowed",
                                    }},
                                    {$unwind: {path: "$commenterData", preserveNullAndEmptyArrays: true}},
                                    {
                                          $addFields: {
                                                "isFollowed": {
                                                      $cond: [ { $eq: [ "$isFollowed", [] ] }, false, true ]
                                                }
                                          }
                                    },
                                    {$match: {$expr: {$eq: ["$isFollowed", true]}}},
                                    {
                                          $group :
                                          {
                                                _id : "$commenterId",
                                                isFollowed: {$first: "$isFollowed"},
                                                comment: {$first: "$comment"},
                                                commenterData: {$first: "$commenterData"}
                                          }
                                    },
                                    {$limit: 3}
                              ]
                        }},
                        {
                              $addFields: {
                                    "total": {
                                          $cond: [ { $eq: [ "$total", [] ] }, 0, "$total.total" ]
                                    }
                              }
                        },
                        {$unwind: {path: "$total", preserveNullAndEmptyArrays: true}},
                  ],
                  as: "comments",
            }},
            {lookup: {
                  from: "Likes",
                  let: {postId: "$_id"},
                  pipeline: [
                        {$match: { $expr: 
                              { $eq: ["$postId", "$$postId"]},
                        }},
                        {$facet: {
                              total: [
                                    {$count: "total"}
                              ],
                              lazy_data: [
                                    {$lookup: {
                                          from: "_User",
                                          let: { ownerId: "$likerId"},
                                          pipeline: [
                                                {$match: { $expr: { $eq: ["$_id", "$$ownerId"]}}},
                                                {$project: { username: 1, ethAddress: 1}}
                                          ],
                                          as: "likerData",
                                    }},
                                    {$lookup: {
                                          from: "Follows",
                                          let: { ownerId: "$likerId"},
                                          pipeline: [
                                                {$match: { $expr: {$and: [
                                                      {$eq: ["$fldId", "$$ownerId"]},
                                                      {$eq: ["$flrId", request.user.id]},
                                                ]}}},
                                          ],
                                          as: "isFollowed",
                                    }},
                                    {$unwind: {path: "$likerData", preserveNullAndEmptyArrays: true}},
                                    {
                                          $addFields: {
                                                "isFollowed": {
                                                      $cond: [ { $eq: [ "$isFollowed", [] ] }, false, true ]
                                                }
                                          }
                                    },
                                    {
                                          $addFields: {
                                                "isMe": {
                                                      $cond: [ { $eq: [ "$likerData._id", request.user.id ] }, true, false ]
                                                }
                                          }
                                    },
                                    {$match: {$expr: {$or: [
                                          {$eq: ["$isFollowed", true]},
                                          {$eq: ["$isMe", true]}
                                    ]}}},
                                    {$sort: {"isMe": -1}},
                                    {$limit: 3}
                              ],
                        }},
                        {
                              $addFields: {
                                    "total": {
                                          $cond: [ { $eq: [ "$total", [] ] }, 0, "$total.total" ]
                                    }
                              }
                        },
                        {$unwind: {path: "$total", preserveNullAndEmptyArrays: true}}
                  ],
                  as: "likes",
            }},
            {lookup: {
                  from: "_User",
                  let: { ownerId: "$userId"},
                  pipeline: [
                        {$match: { $expr: { $eq: ["$_id", "$$ownerId"]}}},
                        {$project: { username: 1, ethAddress: 1, pfp: 1}}
                  ],
                  as: "ownerData",
            }},
            {lookup: {
                  from: "Likes",
                  let: {postId: "$_id"},
                  pipeline: [
                        {$match: { $expr: {$and: [
                              { $eq: ["$likerId", request.user.id]},
                              { $eq: ["$postId", "$$postId"]},
                        ]}}},
                  ],
                  as: "likedByMe",
            }},
            {
                  addFields: {
                        "likedByMe": {
                              $cond: [ { $eq: [ "$likedByMe", [] ] }, false, true ]
                        }
                  }
            },
            {unwind: {path: "$likes", preserveNullAndEmptyArrays: true}},
            {unwind: {path: "$comments", preserveNullAndEmptyArrays: true}},
            {unwind: {path: "$ownerData", preserveNullAndEmptyArrays: true}},
            {sort: {"timeAddedToFavorites": -1}},
            {skip: skipData},
            {limit: limit}
      ];
      return query.aggregate(pipeline, {useMasterKey: true});
});

