myguess,yourguess=st.tabs(["My guess","Your Guess"])
with myguess:
    with st.container(height=400):
        col1,col2,col3=st.columns(3)
        with col1:
            st.write("### :green-background[Guesses]")
            st.code("1023")
            st.divider()
            st.code("1023")
            st.divider()
            st.code("1023")
            st.divider()
            st.code("1023")
            st.divider()

        with col2:
            st.write("### :red-background[Dead]")
            st.code("{dead:3}")
            st.divider()
            st.code("{dead:3}")
            st.divider()
            st.code("{dead:3}")
            st.divider()
            st.code("{dead:3}")
            st.divider()

        with col3:
            st.write("### :violet-background[Injured]")
            st.code("{Injured:0}")
            st.divider()
            st.code("{Injured:0}")
            st.divider()
            st.code("{Injured:0}")
            st.divider()
            st.code("{Injured:0}")
            st.divider()
    st.chat_input("Make a guess",key="players_guess")

         
        

    




with yourguess:
    col1,col2,col3=st.columns(3)
    with col1:
        st.write("### :green-background[Guesses]")
        st.code("1023")
        st.divider()
        st.code("1023")
        st.divider()
        st.code("1023")
        st.divider()
        st.code("1023")
        st.divider()

    with col2:
        st.write("### :red-background[Dead]")
        st.code("{dead:3}")
        st.divider()
        st.code("{dead:3}")
        st.divider()
        st.code("{dead:3}")
        st.divider()
        st.code("{dead:3}")
        st.divider()

    with col3:
        st.write("### :violet-background[Injured]")
        st.code("{Injured:0}")
        st.divider()
        st.code("{Injured:0}")
        st.divider()
        st.code("{Injured:0}")
        st.divider()
        st.code("{Injured:0}")
        st.divider()